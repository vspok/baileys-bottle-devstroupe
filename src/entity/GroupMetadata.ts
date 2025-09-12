import { GroupParticipant } from "baileys";
import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from "typeorm";
import { Auth } from "./Auth.js";

@Entity()
@Unique(["DBId"])
export class GroupMetadata {
  @PrimaryGeneratedColumn()
  DBId: number;

  @ManyToOne(() => Auth, (auth) => auth.chats, { onDelete: "CASCADE" })
  DBAuth: Relation<Auth>;

  @Column()
  id: string;

  @Column({ nullable: true })
  owner: string | undefined;

  @Column()
  subject: string;

  @Column({ nullable: true })
  subjectOwner?: string;

  @Column({ nullable: true })
  subjectTime?: number;

  @Column({ nullable: true })
  creation?: number;

  @Column({ nullable: true })
  desc?: string;

  @Column({ nullable: true })
  descOwner?: string;

  @Column({ nullable: true })
  descId?: string;

  @Column({ nullable: true })
  restrict?: boolean;

  @Column({ nullable: true })
  announce?: boolean;

  @Column({ nullable: true })
  size?: number;

  @Column({ nullable: true, type: "simple-json" })
  participants: Relation<GroupParticipant>[];

  @Column({ nullable: true })
  ephemeralDuration?: number;

  @Column({ nullable: true })
  inviteCode?: string;
}
