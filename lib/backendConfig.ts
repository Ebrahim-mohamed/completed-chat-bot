// Hardcoded on purpose — no env vars.
export const BACKEND_BASE_URL = "http://localhost:8000";
export const ADMIN_API_KEY = "raylab-admin-test-key";

export const CHAT_ENDPOINT = `${BACKEND_BASE_URL}/api/whatsapp/chat`;

export const VOICE_ENDPOINT = `${BACKEND_BASE_URL}/api/whatsapp/voice`;
export const ASR_HEALTH_ENDPOINT = `${BACKEND_BASE_URL}/api/asr/health`;

// ASSUMPTION: you never gave me the exact "update" path, so this mirrors the
// chat endpoint's shape. Change this if your real update endpoint differs.
export const UPDATE_ENDPOINT = `${BACKEND_BASE_URL}/api/sync`;