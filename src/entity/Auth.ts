import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Chat } from "./Chat.js";
import { Contact } from "./Contact.js";
import { GroupMetadata } from "./GroupMetadata.js";
import { MessageDic } from "./MessageDic.js";
import { PresenceDic } from "./PresenceDic.js";

@Entity()
@Unique(["key"])
export class Auth {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({unique: true})
  key: string;

  @Column({ type: "text" })
  value: string;

  @OneToMany(() => Chat, (chat) => chat.DBAuth)
  chats: Chat[];

  @OneToMany(() => Contact, (contact) => contact.DBAuth)
  contacts: Contact[];

  @OneToMany(() => GroupMetadata, (group) => group.DBAuth)
  groups: GroupMetadata[];

  @OneToMany(() => MessageDic, (messageDic) => messageDic.DBAuth)
  messageDics: MessageDic[];

  @OneToMany(() => PresenceDic, (presenceDic) => presenceDic.DBAuth)
  presenceDics: PresenceDic[];
}
