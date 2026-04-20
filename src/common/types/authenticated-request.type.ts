import type { Request } from 'express';

import type { Actor } from '../interfaces';

export type AuthenticatedRequest = Request & { user: Actor };
