'use strict';
const { createApp } = require('./app');
const app = createApp();
const server = app.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => {
  console.log(`EzStorage ready at http://localhost:${process.env.PORT || 3000}`);
});
function shutdown() { server.close(() => { app.locals.close(); process.exit(0); }); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
