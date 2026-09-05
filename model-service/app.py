"""
MediScan Model Service
-----------------------------------------------------------------------------
Loads the trained multimodal wound assessment model (EfficientNet-B0 image
encoder + DistilBERT text encoder, fused into 3 prediction heads) and serves
it over a small HTTP API that the Node/Express backend
(src/services/aiService.js) calls for every new assessment.
-----------------------------------------------------------------------------
"""

import base64
import io
import json
import os
from contextlib import asynccontextmanager

import torch
import torch.nn as nn
import torch.nn.functional as F
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from PIL import Image
from torchvision import transforms, models
from transformers import AutoTokenizer, AutoModel


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_PATH = os.path.join(
    BASE_DIR,
    "model",
    "best_multimodal_model.pth"
)

MAPPING_PATH = os.path.join(
    BASE_DIR,
    "model",
    "class_mapping.json"
)

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

TEXT_MODEL_NAME = "distilbert-base-uncased"
MAX_TEXT_LEN = 48


SEVERITY_NAMES = {
    0: "Low",
    1: "Moderate",
    2: "Severe"
}

URGENCY_NAMES = {
    0: "Routine",
    1: "Urgent",
    2: "Emergency"
}


eval_img_transform = transforms.Compose(
    [
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        ),
    ]
)


# ----------------------------------------------------------------------------
# Model architecture — must match training exactly to load the .pth weights
# ----------------------------------------------------------------------------

class MultimodalWoundFusionModel(nn.Module):

    def __init__(
        self,
        num_wound_classes,
        num_severity_levels=3,
        num_urgency_levels=3,
        embed_dim=256
    ):
        super().__init__()

        effnet = models.efficientnet_b0(weights=None)

        self.image_encoder = effnet.features

        self.image_pool = nn.AdaptiveAvgPool2d((1, 1))

        self.image_proj = nn.Sequential(
            nn.Linear(1280, embed_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
        )

        self.text_encoder = AutoModel.from_pretrained(
            TEXT_MODEL_NAME
        )

        text_hidden_size = self.text_encoder.config.hidden_size

        self.text_proj = nn.Sequential(
            nn.Linear(text_hidden_size, embed_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
        )

        # Uses BatchNorm1d (ensure model is always in eval mode for batch size 1)
        self.fusion_layer = nn.Sequential(
            nn.Linear(embed_dim * 2, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.4),
        )

        self.wound_head = nn.Linear(
            256,
            num_wound_classes
        )

        self.severity_head = nn.Linear(
            256,
            num_severity_levels
        )

        self.urgency_head = nn.Linear(
            256,
            num_urgency_levels
        )


    def forward(
        self,
        images,
        input_ids,
        attention_mask
    ):

        # Image branch
        img_feats = self.image_encoder(images)

        img_feats = self.image_pool(
            img_feats
        ).flatten(1)

        img_embed = self.image_proj(
            img_feats
        )


        # Text branch
        text_out = self.text_encoder(
            input_ids=input_ids,
            attention_mask=attention_mask
        )

        token_embeds = text_out.last_hidden_state

        mask = attention_mask.unsqueeze(-1).float()

        summed = (
            token_embeds * mask
        ).sum(dim=1)

        counts = mask.sum(
            dim=1
        ).clamp(min=1e-9)

        pooled_text = summed / counts

        text_embed = self.text_proj(
            pooled_text
        )


        # Fusion
        fused = torch.cat(
            [img_embed, text_embed],
            dim=1
        )

        fused = self.fusion_layer(
            fused
        )


        # Three prediction heads
        return (
            self.wound_head(fused),
            self.severity_head(fused),
            self.urgency_head(fused)
        )


# ----------------------------------------------------------------------------
# Class Mappings & Global Instances
# ----------------------------------------------------------------------------

if os.path.exists(MAPPING_PATH):

    with open(MAPPING_PATH, "r") as f:
        CLASS_TO_IDX = json.load(f)

else:

    CLASS_TO_IDX = {
        "abrasion": 0,
        "bruise": 1,
        "burn": 2,
        "cut": 3,
        "ingrown_nail": 4,
        "laceration": 5,
        "stab_wound": 6,
        "wound": 7
    }


IDX_TO_CLASS = {
    v: k
    for k, v in CLASS_TO_IDX.items()
}


_model = None
_tokenizer = None


# ----------------------------------------------------------------------------
# Model initialization
# ----------------------------------------------------------------------------

def init_model_and_tokenizer():

    global _model, _tokenizer


    if _tokenizer is None:

        print(
            f"Loading tokenizer: {TEXT_MODEL_NAME}..."
        )

        _tokenizer = AutoTokenizer.from_pretrained(
            TEXT_MODEL_NAME
        )


    if _model is None:

        print(
            "Initializing model architecture..."
        )

        m = MultimodalWoundFusionModel(
            num_wound_classes=len(CLASS_TO_IDX)
        )


        if os.path.exists(WEIGHTS_PATH):

            print(
                f"Loading PyTorch model weights from: "
                f"{WEIGHTS_PATH}"
            )

            m.load_state_dict(
                torch.load(
                    WEIGHTS_PATH,
                    map_location=DEVICE
                )
            )

        else:

            print(
                f"WARNING: Weights not found at "
                f"{WEIGHTS_PATH}. "
                f"Running with UNTRAINED random weights."
            )


        m.to(DEVICE)

        m.eval()  # Crucial for BatchNorm with single-item batches

        _model = m


    print(
        f"Model service ready on device: {DEVICE}"
    )


def get_model():

    if _model is None:
        init_model_and_tokenizer()

    return _model


def get_tokenizer():

    if _tokenizer is None:
        init_model_and_tokenizer()

    return _tokenizer


# ----------------------------------------------------------------------------
# FastAPI Lifecycle
# ----------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):

    # Load model when server starts
    init_model_and_tokenizer()

    yield


app = FastAPI(
    title="MediScan Wound Assessment Model Service",
    lifespan=lifespan
)


# ----------------------------------------------------------------------------
# Request schema
# ----------------------------------------------------------------------------

class PredictRequest(BaseModel):

    description: str = ""

    imageBase64: str | None = None


# ----------------------------------------------------------------------------
# Health endpoint
# ----------------------------------------------------------------------------

@app.get("/health")
def health():

    return {
        "status": "ok",
        "device": str(DEVICE),
        "weights_loaded": os.path.exists(
            WEIGHTS_PATH
        ),
        "model_in_memory": _model is not None
    }


# ----------------------------------------------------------------------------
# Prediction endpoint
# ----------------------------------------------------------------------------

@app.post("/predict")
def predict(req: PredictRequest):

    if not req.imageBase64:

        raise HTTPException(
            status_code=400,
            detail=(
                "imageBase64 is required — "
                "the model is multimodal (image + text)."
            )
        )


    if not req.description or not req.description.strip():

        raise HTTPException(
            status_code=400,
            detail=(
                "description is required — "
                "the model is multimodal (image + text)."
            )
        )


    try:

        model = get_model()

        tokenizer = get_tokenizer()


        # Handle base64 image header if present
        img_str = req.imageBase64

        if "," in img_str:

            img_str = img_str.split(
                ",",
                1
            )[1]


        # Decode image

        img_bytes = base64.b64decode(
            img_str
        )

        raw_img = Image.open(
            io.BytesIO(img_bytes)
        )
        
        # Convert RGBA/P formats safely to RGB
        if raw_img.mode != "RGB":
            raw_img = raw_img.convert("RGB")


        # Image preprocessing

        img_tensor = eval_img_transform(
            raw_img
        ).unsqueeze(0).to(DEVICE)


        # Tokenize description

        encoded = tokenizer(
            req.description,
            padding="max_length",
            truncation=True,
            max_length=MAX_TEXT_LEN,
            return_tensors="pt",
        )


        input_ids = encoded[
            "input_ids"
        ].to(DEVICE)


        attention_mask = encoded[
            "attention_mask"
        ].to(DEVICE)


        # ------------------------------------------------------------
        # MODEL INFERENCE
        # ------------------------------------------------------------

        with torch.inference_mode():

            w_logits, s_logits, u_logits = model(
                img_tensor,
                input_ids,
                attention_mask
            )


            w_probs = F.softmax(
                w_logits,
                dim=1
            )[0]


            s_probs = F.softmax(
                s_logits,
                dim=1
            )[0]


            u_probs = F.softmax(
                u_logits,
                dim=1
            )[0]


            w_idx = int(
                w_probs.argmax().item()
            )


            s_idx = int(
                s_probs.argmax().item()
            )


            u_idx = int(
                u_probs.argmax().item()
            )


        # ------------------------------------------------------------
        # DEBUG: PRINT ACTUAL MODEL PREDICTIONS
        # ------------------------------------------------------------

        print(
            "\n========== MODEL PREDICTION =========="
        )

        print(
            "Wound probabilities:",
            w_probs.cpu().numpy()
        )

        print(
            "Severity probabilities:",
            s_probs.cpu().numpy()
        )

        print(
            "Urgency probabilities:",
            u_probs.cpu().numpy()
        )

        print(
            "Predicted wound index:",
            w_idx
        )

        print(
            "Predicted severity index:",
            s_idx
        )

        print(
            "Predicted urgency index:",
            u_idx
        )

        print(
            "======================================\n"
        )


        # ------------------------------------------------------------
        # RETURN PREDICTION
        # ------------------------------------------------------------

        return {

            "wound_class": IDX_TO_CLASS.get(
                w_idx,
                "wound"
            ),

            "wound_confidence": round(
                float(
                    w_probs[w_idx].item()
                ),
                4
            ),

            "severity": SEVERITY_NAMES.get(
                s_idx,
                "Low"
            ),

            "severity_confidence": round(
                float(
                    s_probs[s_idx].item()
                ),
                4
            ),

            "urgency": URGENCY_NAMES.get(
                u_idx,
                "Routine"
            ),

            "urgency_confidence": round(
                float(
                    u_probs[u_idx].item()
                ),
                4
            ),
        }


    except HTTPException:

        raise


    except Exception as exc:

        raise HTTPException(
            status_code=500,
            detail=f"Inference failed: {exc}"
        ) from exc