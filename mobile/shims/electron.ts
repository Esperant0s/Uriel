// server.js only touches electron for app.getPath('downloads'); resolveDownloadDir() wins first anyway.
export = { app: { getPath: () => '/data/Downloads' } };
