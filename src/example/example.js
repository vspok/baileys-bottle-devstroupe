const makeWASocket = require("baileys").default;
const { DisconnectReason, fetchLatestBaileysVersion } = require("baileys");
const log = require("baileys/lib/Utils/logger").default;
const BaileysBottle = require("baileys-bottle-devstroupe").default;
const { Boom } = require("@hapi/boom");

console.clear();
console.log("Initializing DB...");

BaileysBottle.init({
    type: "sqlite",
    database: "db.sqlite"
}).then(async bottle => {
    console.log("DB initialized");

    const client = async clientName => {
        console.log(`Starting client "${clientName}"`);

        const logger = log.child({});
        logger.level = "silent";

        console.log("Creating store...");
        const { auth, store } = await bottle.createStore(clientName);
        console.log("Creating auth...");
        const { state, saveState } = await auth.useAuthHandle({
            credsFile: "./src/example/session/creds.json", // optional path to creds file
            replace: false //optional, set true to force session replacement if already exists in DB
        });
        console.log("Done");

        const startSocket = async () => {
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(
                `using WA v${version.join(".")}, isLatest: ${isLatest}`
            );

            const sock = makeWASocket({
                version,
                printQRInTerminal: true,
                auth: state,
                logger
            });

            store.bind(sock.ev);

            sock.ev.process(async events => {
                //
                // Start your bot code here...
                //
                if (events["messages.upsert"]) {
                    const upsert = events["messages.upsert"];
                    console.log(
                        "recv messages ",
                        JSON.stringify(upsert, undefined, 2)
                    );
                    if (upsert.type === "notify") {
                        for (const msg of upsert.messages) {
                            if (!msg.key.fromMe) {
                                // mark message as read
                                await sock.readMessages([msg.key]);
                            }
                        }
                    }
                }
                //
                // End your bot code here...
                //

                // credentials updated -- save them
                if (events["creds.update"]) await saveState();

                if (events["connection.update"]) {
                    const update = events["connection.update"];
                    const { connection, lastDisconnect } = update;
                    connection === "open"
                        ? console.log("Connected")
                        : connection === "close"
                        ? (
                              lastDisconnect.error instanceof Boom
                                  ? lastDisconnect.error.output.statusCode !==
                                    DisconnectReason.loggedOut
                                  : false
                          )
                            ? startSocket()
                            : console.log(
                                  "Connection closed. You are logged out."
                              )
                        : null;
                }
            });
        };

        startSocket();
    };

    client("client 1").then(() => {
        // await client("client 2");
        // await client("client 3");
        // ...
    });
});
