
import { normalizeConnectorType } from "../server/lib/connectors/resolver";

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`FAIL: ${message}`);
    }
    console.log(`PASS: ${message}`);
}

async function testResolver() {
    console.log("Running Connector Resolver Regression Tests...");

    // 1. Canonical inputs
    assert(normalizeConnectorType("google") === "google", "google -> google");
    assert(normalizeConnectorType("slack") === "slack", "slack -> slack");
    assert(normalizeConnectorType("atlassian") === "atlassian", "atlassian -> atlassian");
    assert(normalizeConnectorType("upload") === "upload", "upload -> upload");

    // 2. Aliases for Drive
    assert(normalizeConnectorType("drive") === "google", "drive -> google");
    assert(normalizeConnectorType("google-drive") === "google", "google-drive -> google");
    assert(normalizeConnectorType("gdrive") === "google", "gdrive -> google");
    assert(normalizeConnectorType("GOOGLE") === "google", "GOOGLE (case) -> google");
    assert(normalizeConnectorType(" Drive ") === "google", " Drive (trim) -> google");

    // 3. Aliases for Jira/Conf
    assert(normalizeConnectorType("jira") === "atlassian", "jira -> atlassian");
    assert(normalizeConnectorType("confluence") === "atlassian", "confluence -> atlassian");

    // 4. Unknowns
    try {
        normalizeConnectorType("foo");
        throw new Error("FAIL: foo should throw");
    } catch (e: any) {
        assert(e.message.includes("Allowed:"), "Unknown type throws helpful error");
    }

    // 5. Empty
    try {
        normalizeConnectorType("");
        throw new Error("FAIL: empty string should throw");
    } catch (e: any) {
        assert(e.message.includes("cannot be empty"), "Empty string throws error");
    }
}

testResolver().catch(e => {
    console.error(e);
    process.exit(1);
});
