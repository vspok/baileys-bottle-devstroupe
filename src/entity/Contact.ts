import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
  Unique,
} from "typeorm";
import { Auth } from "./Auth.js";

@Entity()
@Unique(["id", "authId"])
export class Contact {
  @PrimaryGeneratedColumn()
  DBId: number;

  @ManyToOne(() => Auth, (auth) => auth.contacts, { onDelete: "CASCADE" })
  @JoinColumn({ name: "authId" })
  DBAuth: Relation<Auth>;

  @Column()
  authId: number;

  @Column()
  id: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  notify?: string;

  @Column({ nullable: true })
  verifiedName?: string;

  @Column({ nullable: true })
  imgUrl?: string | "changed";

  @Column({ nullable: true })
  status?: string;
}
