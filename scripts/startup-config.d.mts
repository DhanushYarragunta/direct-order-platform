export function validateStartupConfig(env?: Record<string, string | undefined>): {
  origin: string;
  publicTestPayments: boolean;
};
