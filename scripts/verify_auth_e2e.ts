
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, baseURL: 'http://localhost:5000' }));

async function testAuth() {
    try {
        console.log("Attempting login...");
        const loginRes = await client.post('/api/auth/login', {
            email: 'admin@tracepilot.com',
            password: 'admin123'
        });
        console.log("Login Status:", loginRes.status);
        console.log("Login Data:", loginRes.data);

        console.log("Checking /api/auth/me...");
        const meRes = await client.get('/api/auth/me');
        console.log("Me Status:", meRes.status);
        console.log("Me Data:", meRes.data);

        if (meRes.status === 200 && meRes.data.email === 'admin@tracepilot.com') {
            console.log("PASS: Auth verification successful.");
        } else {
            console.log("FAIL: Auth mismatch.");
            process.exit(1);
        }
    } catch (error: any) {
        console.error("FAIL: Error during auth verification.");
        if (error.response) {
            console.error(error.response.status, error.response.data);
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

testAuth();
