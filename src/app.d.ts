import type { SessionUser } from '$lib/server/auth/session';

declare global {
	namespace App {
		interface Locals {
			user: SessionUser | null;
			requestId: string;
		}
		interface Error {
			message: string;
		}
	}
}

export {};
