// Tiny logger so every stage prints "[time] stage  message".
const ts = () => new Date().toISOString().slice(11, 19);
const fmt = (scope: string, msg: string) => `[${ts()}] ${scope.padEnd(11)} ${msg}`;

export const log = {
  info: (scope: string, msg: string) => console.log(fmt(scope, msg)),
  warn: (scope: string, msg: string) => console.warn(fmt(scope, `WARN ${msg}`)),
  debug: (scope: string, msg: string) => {
    if (process.env.DEBUG === '1') console.log(fmt(scope, msg));
  },
};
