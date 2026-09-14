import { Counter, Trend } from 'k6/metrics';

export const serverErrors5xx = new Counter('server_errors_5xx');
export const apiErrors = new Counter('api_errors');
export const errorAtIteration = new Trend('error_at_iteration', false);
export const errorAtVu = new Trend('error_at_vu', false);
export const usersCompleted = new Counter('users_completed');
export const usersAllPassed = new Counter('users_all_passed');
export const usersPartialFail = new Counter('users_partial_fail');
