require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const EmergencyGuide = require('../models/EmergencyGuide');

const guides = [
  {
    title: 'Burns',
    icon: 'fa-solid fa-fire',
    color: '#f97316',
    description: 'Cool under running water for 10-15 minutes. Never use ice, butter, or ointments on a fresh burn.',
    order: 1,
  },
  {
    title: 'Cuts & Wounds',
    icon: 'fa-solid fa-droplet',
    color: '#ec4899',
    description: "Apply firm, direct pressure with a clean cloth. Elevate the area and seek care if bleeding doesn't stop.",
    order: 2,
  },
  {
    title: 'Sprains & Fractures',
    icon: 'fa-solid fa-bone',
    color: '#8b5cf6',
    description: 'Rest, ice, compress, and elevate. Avoid moving the area and immobilize before transport.',
    order: 3,
  },
  {
    title: 'Allergic Reactions',
    icon: 'fa-solid fa-hand-holding-medical',
    color: '#22c55e',
    description: 'Watch for swelling or breathing trouble. Use an epinephrine auto-injector if prescribed, then call emergency services.',
    order: 4,
  },
];

async function run() {
  await connectDB();
  await EmergencyGuide.deleteMany({});
  await EmergencyGuide.insertMany(guides);
  console.log(`Seeded ${guides.length} emergency guide cards.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
