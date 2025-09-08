import { WAPresence } from "baileys";
import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { PresenceDic } from "./PresenceDic.js";

@Entity()
@Unique(["DBId"])
export class Presence {
  @PrimaryGeneratedColumn()
  DBId: number;

  @ManyToOne(() => PresenceDic, (x) => x.presences, { onDelete: "CASCADE" })
  dictionary: PresenceDic;

  @Column()
  participant: string;

  @Column({ type: "simple-json" })
  lastKnownPresence: WAPresence;

  @Column({ nullable: true })
  lastSeen?: number;
}
