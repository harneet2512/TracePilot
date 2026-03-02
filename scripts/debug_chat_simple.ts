
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
            message: "Hello world"
        });
        console.log("Response:", res.status, res.data);
    } catch (e: any) {
        console.error("Error:", e.message);
        if (e.response) console.error(JSON.stringify(e.response.data));
    }
}

run();
