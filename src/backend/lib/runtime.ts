import os from 'node:os';

// Module state lives as long as the container. Comparing it across calls shows
// when OCP reuses a warm container and when it starts a new one.
const containerStartedAt = new Date().toISOString();
let invocations = 0;

export function nextInvocation(): {invocation: number; containerStartedAt: string} {
  invocations += 1;
  return {invocation: invocations, containerStartedAt};
}

export function runtimeInfo() {
  const memory = process.memoryUsage();
  return {
    containerStartedAt,
    invocationsServed: invocations,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    hostname: os.hostname(),
    cpus: os.cpus().length,
    totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    rssMb: Math.round(memory.rss / 1024 / 1024),
    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    uptimeSeconds: Math.round(process.uptime()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cwd: process.cwd()
  };
}
