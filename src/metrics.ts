import { installMetrics } from './metricsClient';

installMetrics(import.meta.env.VITE_METRICS_SITE_HOST, import.meta.env.VITE_METRICS_SCRIPT_URL);
