import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
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
  chats: Relation<Chat>[];

  @OneToMany(() => Contact, (contact) => contact.DBAuth)
  contacts: Relation<Contact>[];

  @OneToMany(() => GroupMetadata, (group) => group.DBAuth)
  groups: Relation<GroupMetadata>[];

  @OneToMany(() => MessageDic, (messageDic) => messageDic.DBAuth)
  messageDics: Relation<MessageDic>[];

  @OneToMany(() => PresenceDic, (presenceDic) => presenceDic.DBAuth)
  presenceDics: Relation<PresenceDic>[];
}
