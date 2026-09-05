# MediScan — Backend

Node.js + Express + MongoDB backend for the MediScan **multimodal wound
assessment** app. Every feature in the UI (dashboard, new assessment, history,
reports, analytics, emergency guide, profile, settings) is wired to a real
API + MongoDB collection. The trained model — an EfficientNet-B0 image
encoder + DistilBERT text encoder, fused and passed through three prediction
heads (wound class / severity / urgency) — is isolated behind a single
integration point, `src/services/aiService.js`, and served by the small
FastAPI app in `model-service/`.

## 1. Requirements

- Node.js 18+
- MongoDB (local install, or a free MongoDB Atlas cluster)
- Python 3.10+ (only needed to run the model service — see `model-service/README.md`)

## 2. Setup

```bash
cd mediscan-backend
npm install
cp .env.example .env
# edit .env: set MONGO_URI and JWT_SECRET at minimum
npm run seed     # loads the Emergency Guide cards into MongoDB
npm run dev       # starts on http://localhost:5000 (or `npm start`)
```

Open the app: **http://localhost:5000** — this serves the frontend
(`public/index.html`, the MediScan UI) directly, on the same origin as
the API, so there's no CORS setup needed and nothing else to run.

Check the API is alive separately if you want:

```bash
curl http://localhost:5000/api/health
```

## 3. Plugging in the trained model

`src/services/aiService.js` is the single integration point, and
`model-service/` is a ready-made FastAPI wrapper around the trained
`.pth` weights.

1. Copy the trained weights into `model-service/model/best_multimodal_model.pth`
   (`model-service/model/class_mapping.json` is already included).
2. `cd model-service && pip install -r requirements.txt`
3. `uvicorn app:app --host 0.0.0.0 --port 8000`
4. In `mediscan-backend/.env` set:
   ```
   MODEL_API_URL=http://localhost:8000/predict
   ```

The Node backend POSTs:
```json
{ "description": "string", "imageBase64": "base64 wound image" }
```
and expects back exactly the model's 3 outputs + confidences — nothing else:
```json
{
  "wound_class": "laceration",
  "wound_confidence": 0.91,
  "severity": "Severe",
  "severity_confidence": 0.87,
  "urgency": "Emergency",
  "urgency_confidence": 0.94
}
```
`wound_class` is always one of: `abrasion`, `bruise`, `burn`, `cut`,
`ingrown_nail`, `laceration`, `stab_wound`, `wound`. `severity` is
`Low | Moderate | Severe`. `urgency` is `Routine | Urgent | Emergency`.

Until `MODEL_API_URL` is set, a lightweight local fallback runs instead so
the rest of the app (dashboard stats, history, reports, analytics) is still
testable — it only ever returns the model's real categories, never invented
fields such as a diagnosis subtype, prescription, or treatment recommendation.

## 4. Project structure

```
mediscan-backend/
├── server.js                 # entry point
├── public/
│   └── index.html             # frontend (MediScan UI), served at http://localhost:5000/
├── model-service/             # FastAPI wrapper around the trained .pth model
│   ├── app.py
│   ├── model/class_mapping.json
│   └── model/best_multimodal_model.pth   # <-- copy the trained weights here
├── src/
│   ├── app.js                 # express app + route mounting
│   ├── config/db.js           # mongoose connection
│   ├── models/                # User, Assessment, EmergencyGuide
│   ├── middleware/             # auth (JWT), multer upload, error handler
│   ├── controllers/            # route handlers, one file per feature
│   ├── routes/                 # route definitions
│   ├── services/aiService.js   # <-- model integration point
│   └── utils/seedEmergencyGuide.js
└── uploads/                    # uploaded wound photos (served at /uploads)
```

## 5. Auth

All routes except `/api/health`, `/api/auth/register`, `/api/auth/login`
require a `Authorization: Bearer <token>` header. Get a token from
register/login.

## 6. API Reference

### Auth
| Method | Route | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | `name, email, password, age?, bloodGroup?, allergies?, emergencyContact?, location?` | returns `{ token, user }` |
| POST | `/api/auth/login` | `email, password` | returns `{ token, user }` |
| GET | `/api/auth/me` | — | current user |

### Assessments (New Assessment / History / Reports)
| Method | Route | Notes |
|---|---|---|
| POST | `/api/assessments` | multipart form: `image` file (required) + `description` (required). Both are required — the model is multimodal. Runs the AI service and saves `woundClass, woundConfidence, severity, severityConfidence, urgency, urgencyConfidence`. |
| GET | `/api/assessments?severity=&urgency=&woundClass=&search=&page=&limit=` | history list, filter + search |
| GET | `/api/assessments/:id` | single assessment |
| DELETE | `/api/assessments/:id` | delete |
| GET | `/api/assessments/:id/report` | streams a PDF report download |

### Dashboard
| Method | Route | Notes |
|---|---|---|
| GET | `/api/dashboard/stats` | total / low / moderate / severe counts + %, plus routine / urgent / emergency counts + % |
| GET | `/api/dashboard/recent?limit=3` | recent assessments list |

### Analytics
| Method | Route | Notes |
|---|---|---|
| GET | `/api/analytics/timeline?days=30` | assessments-per-day, for the line chart |
| GET | `/api/analytics/wound-types` | % breakdown across the 8 wound classes |
| GET | `/api/analytics/severity` | % breakdown across Low / Moderate / Severe |
| GET | `/api/analytics/urgency` | % breakdown across Routine / Urgent / Emergency |

### Emergency Guide
| Method | Route | Notes |
|---|---|---|
| GET | `/api/emergency-guide` | static reference cards (seeded) |

### Profile
| Method | Route | Notes |
|---|---|---|
| GET | `/api/profile` | current user's profile fields |
| PUT | `/api/profile` | `name, age, bloodGroup, allergies, emergencyContact, location` |

### Settings
| Method | Route | Notes |
|---|---|---|
| GET | `/api/settings` | `pushNotifications, darkMode, emailAlerts` |
| PUT | `/api/settings` | update any of the above |

A ready-to-import Postman collection is included: `mediscan.postman_collection.json`
(update requests referencing the old fields if you re-import an older export).

## 7. Connecting the frontend (`public/index.html`)

The frontend is served directly by this backend at **http://localhost:5000/**,
same-origin with the API. The JWT from login is stored in `localStorage` and
sent as `Authorization: Bearer <token>` on every request. "New Assessment"
submits `multipart/form-data` (`image` + `description`) to
`POST /api/assessments`, then renders the returned
`assessment.woundClass / woundConfidence / severity / severityConfidence /
urgency / urgencyConfidence` in the "AI Wound Assessment" result panel.

## 8. Notes on MongoDB

Every collection is created automatically by Mongoose on first write —
no manual schema setup needed. Collections: `users`, `assessments`,
`emergencyguides`.
