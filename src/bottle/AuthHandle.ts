import {
    AuthenticationCreds,
    AuthenticationState,
    BufferJSON,
    initAuthCreds,
    proto,
    SignalDataTypeMap
} from "baileys";
import { DataSource } from "typeorm";
import { Auth } from "../entity/Auth";
import AsyncLock from "async-lock";
import { access, readFile } from "fs/promises";

const fileLock = new AsyncLock({ maxPending: Infinity });

const KEY_MAP: { [T in keyof SignalDataTypeMap]: string } = {
    "pre-key": "preKeys",
    session: "sessions",
    "sender-key": "senderKeys",
    "app-state-sync-key": "appStateSyncKeys",
    "app-state-sync-version": "appStateVersions",
    "sender-key-memory": "senderKeyMemory"
};

interface AuthOptions {
    credsFile?: string;
    replace?: boolean;
}

export default class AuthHandle {
    constructor(
        private ds: DataSource,
        private key: string
    ) {}
    private repos = {
        auth: this.ds.getRepository(Auth)
    };

    useAuthHandle = async (
        options: AuthOptions = {}
    ): Promise<{
        state: AuthenticationState;
        saveState: () => Promise<any>;
    }> => {
        const { credsFile, replace = false } = options;

        let creds: AuthenticationCreds;
        let keys: any = {};

        const fileExists = async path => {
            try {
                await access(path);
                return true;
            } catch {
                return false;
            }
        };
        const readData = async (file: string) => {
            try {
                const filePath = file;
                const data = await fileLock.acquire(filePath, () =>
                    readFile(filePath, { encoding: "utf-8" })
                );
                return JSON.parse(data, BufferJSON.reviver);
            } catch (error) {
                return null;
            }
        };

        var existingAuth = await this.repos.auth.findOneBy({
            key: this.key
        });

        ({ creds, keys } =
            credsFile &&
            (await fileExists(credsFile)) &&
            (replace ? true : !(existingAuth && existingAuth.value))
                ? { creds: await readData(credsFile), keys: {} }
                : existingAuth && existingAuth.value
                ? JSON.parse(existingAuth.value, BufferJSON.reviver)
                : {
                      creds: initAuthCreds(),
                      keys: {}
                  });

        const saveState = () =>
            this.repos.auth.upsert(
                {
                    key: this.key,
                    value: JSON.stringify(
                        { creds, keys },
                        BufferJSON.replacer,
                        2
                    )
                },
                {
                    conflictPaths: ["key"]
                }
            );

        return {
            state: {
                creds,
                keys: {
                    get: (type, ids) => {
                        const key = KEY_MAP[type];
                        return ids.reduce((dict, id) => {
                            let value = keys[key]?.[id];
                            if (value) {
                                if (type === "app-state-sync-key")
                                    value =
                                        proto.Message.AppStateSyncKeyData.fromObject(
                                            value
                                        );
                                dict[id] = value;
                            }
                            return dict;
                        }, {});
                    },
                    set: async data => {
                        for (const _key in data) {
                            const key =
                                KEY_MAP[_key as keyof SignalDataTypeMap];
                            keys[key] = keys[key] || {};
                            Object.assign(keys[key], data[_key]);
                        }

                        await saveState();
                    }
                }
            },
            saveState
        };
    };
}
