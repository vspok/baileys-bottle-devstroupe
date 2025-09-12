import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from "typeorm";
import { Auth } from "./Auth.js";
import { Presence } from "./Presence.js";

@Entity()
@Unique(["DBId"])
export class PresenceDic {
  @PrimaryGeneratedColumn()
  DBId: number;

  @ManyToOne(() => Auth, (auth) => auth.chats, { onDelete: "CASCADE" })
  DBAuth: Relation<Auth>;

  @Column()
  id: string;

  @OneToMany(() => Presence, (x) => x.dictionary, {
    cascade: true,
    onDelete: "CASCADE",
  })
  presences: Relation<Presence>[];
}
