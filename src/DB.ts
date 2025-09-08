import { DataSource, DataSourceOptions, TreeChildren } from "typeorm";
import { Auth } from "./entity/Auth.js";
import { Chat } from "./entity/Chat.js";
import { Contact } from "./entity/Contact.js";
import { GroupMetadata } from "./entity/GroupMetadata.js";
import { Message } from "./entity/Message.js";
import { MessageDic } from "./entity/MessageDic.js";
import { Presence } from "./entity/Presence.js";
import { PresenceDic } from "./entity/PresenceDic.js";

class DB {
  static instance = new DB();
  private dataSource: DataSource;
  private constructor() {}

  get = async (
    db: DataSourceOptions,
    options?: {
      debug?: boolean;
      sync?: boolean;
    }
  ) => {
    this.dataSource =
      !options?.sync && this.dataSource
        ? this.dataSource
        : await new DataSource({
            synchronize: options?.sync,
            migrations: [],
            logging: options?.debug,
            charset: "cp1251_general_ci",
            extra: {
              pragma: {
                  journal_mode: 'WAL',
                  synchronous: 'NORMAL',
                  temp_store: 'memory',
                  mmap_size: 268435456, // 256MB
                  cache_size: -64000, // 64MB
              }  
            },
            poolSize: 1,
            acquireTimeout: 30000,
            timeout: 30000,
            ...db,
            entities: [
              Auth,
              Chat,
              Contact,
              GroupMetadata,
              MessageDic,
              Message,
              PresenceDic,
              Presence,
              ...((db.entities as any) || []),
            ],
          } as any).initialize();

    try {
      await this.dataSource.getRepository(Auth).find();
    } catch {
      return await this.get(db, { ...options, sync: true });
    }
    return this.dataSource;
  };
}

export default DB.instance;
