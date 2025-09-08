import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Auth } from "./Auth.js";
import { Message } from "./Message.js";

@Entity()
@Unique(["id"])
export class MessageDic {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Auth, (auth) => auth.chats, { onDelete: "CASCADE" })
  DBAuth: Auth;

  @Column()
  jid: string;

  @OneToMany(() => Message, (x) => x.dictionary, {
    onDelete: "CASCADE",
    cascade: ["remove"],
  })
  messages: Message[];
}
