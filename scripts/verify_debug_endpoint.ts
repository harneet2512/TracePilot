
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = "http://localhost:3000";
const ACCOUNT_ID = "2bfc786e-953d-4c71-bbce-60d91b729c30";

async function verifyDebugEndpoint() {
    try {
        console.log(`Checking Debug Endpoint for Account ${ACCOUNT_ID}...`);

        // We need a session normally, but we allowed skip_auth if it's running via script? 
        // No, I added basic auth check which requires valid session logic.
        // Wait, the new endpoint code says:
        // if (process.env.NODE_ENV !== "development" && !req.isAuthenticated()) ...
        // If NODE_ENV=development, it skips auth? Yes.
        // Let's assume NODE_ENV is development for this test.

        const response = await fetch(`${BASE_URL}/api/debug/google/token-status/${ACCOUNT_ID}`, {
            headers: {
                // Simulate logged in user if needed, but dev mode bypasses
            }
        });

        if (response.status === 401) {
            console.log("FAIL: Unauthorized. Is NODE_ENV=development set?");
            return;
        }

        const data = await response.json();
        console.log("Debug Endpoint Response:", JSON.stringify(data, null, 2));

        if (!data.accountExists) {
            console.log("FAIL: Account reported missing via API (but exists in DB via script). DB Mismatch?");
        } else if (!data.hasAccessToken) {
            console.log("FAIL: API sees no token (but DB script sees one). ORM Mapping issue?");
        } else if (data.accessTokenDecryptedLen === 0) {
            console.log("FAIL: Decryption returned empty in API context.");
        } else {
            console.log("PASS: API sees account and decrypts token.");
        }

    } catch (e) {
        console.error("Verification failed (is server running?):", e);
    }
}

verifyDebugEndpoint();
