import 'dotenv/config'
import { logger } from '@/lib/logger'

// BullMQ workers removed — comment and DM processing happens inline in the webhook handler.
// This file starts the monitor service only.

import '@/monitor/index'

logger.info('Worker process started (inline processing mode — no Redis required)')
