
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, baseURL: 'http://localhost:5000' }));

async function run() {
    try {
        console.log("Login...");
        await client.post('/api/auth/login', {
            email: 'admin@tracepilot.com',
            password: 'admin123'
        });

        console.log("Sending chat message...");
        const res = await client.post('/api/chat', {
            message: "What are the Q4 OKRs?"
        });
        console.log("Response Status:", res.status);
        console.log("Response Data:", JSON.stringify(res.data, null, 2));
    } catch (e: any) {
        console.error("Caught Error!");
        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Data:", JSON.stringify(e.response.data, null, 2));
        } else if (e.request) {
            console.error("No response received (Network/Crash?)");
            console.error("Error Code:", e.code);
            console.error("Error Message:", e.message);
        } else {
            console.error("Setup Error:", e.message);
        }
    }
}

run();
