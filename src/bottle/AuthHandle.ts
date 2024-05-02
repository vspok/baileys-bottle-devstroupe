import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  SignalDataTypeMap,
  SignalKeyStore,
} from "@whiskeysockets/baileys";
import { DataSource } from "typeorm";
import { Auth } from "../entity/Auth";

const KEY_MAP: { [T in keyof SignalDataTypeMap]: string } = {
  "pre-key": "preKeys",
  session: "sessions",
  "sender-key": "senderKeys",
  "app-state-sync-key": "appStateSyncKeys",
  "app-state-sync-version": "appStateVersions",
  "sender-key-memory": "senderKeyMemory",
};

export default class AuthHandle {
  private cachedState: AuthenticationState | null = null;

  constructor(private ds: DataSource, private key: string) {}

  private repos = {
    auth: this.ds.getRepository(Auth),
  };

  private saveState = async (): Promise<void> => {
    if (this.cachedState) {
      await this.repos.auth.upsert(
        {
          key: this.key,
          value: JSON.stringify(this.cachedState, BufferJSON.replacer, 2),
        },
        {
          conflictPaths: ["key"],
        }
      );
    }
  };

  private loadState = async (): Promise<void> => {
    const existingAuth = await this.repos.auth.findOneBy({
      key: this.key,
    });

    if (existingAuth && existingAuth.value) {
      const { creds, keys } = JSON.parse(
        existingAuth.value,
        BufferJSON.reviver
      );

      this.cachedState = { creds, keys };
    } else {
      this.cachedState = {
        creds: initAuthCreds(),
        keys: {} as SignalKeyStore,
      };
    }
  };

  useAuthHandle = async (): Promise<{
    state: AuthenticationState;
    saveState: () => Promise<void>;
  }> => {
    if (!this.cachedState) {
      await this.loadState();
    }

    return {
      state: this.cachedState!,
      saveState: async () => {
        await this.saveState();
      },
    };
  };
}
