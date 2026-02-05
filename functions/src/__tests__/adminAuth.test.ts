jest.mock("firebase-functions/v2", () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
    },
}));

describe("assertAdmin", () => {
    const originalEnv = process.env.ADMIN_UIDS;

    afterEach(() => {
        if (originalEnv === undefined) {
            delete process.env.ADMIN_UIDS;
        } else {
            process.env.ADMIN_UIDS = originalEnv;
        }
        jest.resetModules();
    });

    function loadAssertAdmin(adminUids: string) {
        process.env.ADMIN_UIDS = adminUids;
        const mod = require("../adminAuth");
        return mod.assertAdmin as (request: any) => void;
    }

    it("throws unauthenticated when request.auth is null", () => {
        const assertAdmin = loadAssertAdmin("some-uid");
        try {
            assertAdmin({ auth: null });
            fail("Expected error to be thrown");
        } catch (e: any) {
            expect(e.code).toBe("unauthenticated");
            expect(e.message).toBe("Authentication required.");
        }
    });

    it("throws unauthenticated when request.auth is undefined", () => {
        const assertAdmin = loadAssertAdmin("some-uid");
        try {
            assertAdmin({});
            fail("Expected error to be thrown");
        } catch (e: any) {
            expect(e.code).toBe("unauthenticated");
        }
    });

    it("throws permission-denied for non-admin UID", () => {
        const assertAdmin = loadAssertAdmin("admin-uid-1");
        try {
            assertAdmin({ auth: { uid: "regular-user" } });
            fail("Expected error to be thrown");
        } catch (e: any) {
            expect(e.code).toBe("permission-denied");
            expect(e.message).toBe("Admin access required.");
        }
    });

    it("allows admin UID through and returns the UID", () => {
        const assertAdmin = loadAssertAdmin("admin-uid-1,admin-uid-2");
        expect(assertAdmin({ auth: { uid: "admin-uid-1" } })).toBe("admin-uid-1");
        expect(assertAdmin({ auth: { uid: "admin-uid-2" } })).toBe("admin-uid-2");
    });

    it("rejects all when ADMIN_UIDS is empty", () => {
        const assertAdmin = loadAssertAdmin("");
        try {
            assertAdmin({ auth: { uid: "any-uid" } });
            fail("Expected error to be thrown");
        } catch (e: any) {
            expect(e.code).toBe("permission-denied");
        }
    });

    it("trims whitespace from UIDs", () => {
        const assertAdmin = loadAssertAdmin(" admin-uid-1 , admin-uid-2 ");
        expect(() => assertAdmin({ auth: { uid: "admin-uid-1" } })).not.toThrow();
        expect(() => assertAdmin({ auth: { uid: "admin-uid-2" } })).not.toThrow();
    });
});
