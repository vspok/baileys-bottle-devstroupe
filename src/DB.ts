import { DataSource, DataSourceOptions, TreeChildren } from "typeorm";
import { Auth } from "./entity/Auth";
import { Chat } from "./entity/Chat";
import { Contact } from "./entity/Contact";
import { GroupMetadata } from "./entity/GroupMetadata";
import { Message } from "./entity/Message";
import { MessageDic } from "./entity/MessageDic";
import { Presence } from "./entity/Presence";
import { PresenceDic } from "./entity/PresenceDic";

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
