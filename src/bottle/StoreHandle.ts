import {
  BaileysEventEmitter,
  ConnectionState,
  jidNormalizedUser,
  toNumber,
  updateMessageWithReceipt,
  updateMessageWithReaction,
  WAMessageKey,
  WAMessageCursor,
  Contact,
  WASocket,
  isPnUser, // Substituindo isJidUser por isPnUser
} from "baileys";
import { Chat as DBChat } from "../entity/Chat.js";
import { Contact as DBContact } from "../entity/Contact.js";
import { Message as DBMessage } from "../entity/Message.js";
import { MessageDic as DBMessageDic } from "../entity/MessageDic.js";
import { PresenceDic as DBPresenceDic } from "../entity/PresenceDic.js";
import { Presence as DBPresence } from "../entity/Presence.js";
import { GroupMetadata as DBGroupMetadata } from "../entity/GroupMetadata.js";
import { DataSource, In, LessThan } from "typeorm";
import { Auth } from "../entity/Auth.js";
import { cloneDeep } from "lodash";
import moment from 'moment';

export interface StoreHandleOptions {
  disableDelete?: ("chats" | "messages")[];
}

export default class StoreHandle {
  constructor(
    private ds: DataSource,
    private auth: Auth,
    private options?: StoreHandleOptions
  ) {
    this.options = {
      disableDelete: [],
      ...(this.options || {}),
    };
  }
  private repos = {
    contacts: this.ds.getRepository(DBContact),
    chats: this.ds.getRepository(DBChat),
    messageDics: this.ds.getRepository(DBMessageDic),
    messages: this.ds.getRepository(DBMessage),
    presenceDics: this.ds.getRepository(DBPresenceDic),
    groups: this.ds.getRepository(DBGroupMetadata),
  };

  state: ConnectionState = { connection: "close" };

  chats = {
    all: () =>
      this.repos.chats.findBy({
        DBAuth: {
          id: this.auth.id,
        },
      }),
    id: (id: string): Promise<DBChat | any> =>
      this.repos.chats.findOneBy({
        id,
        DBAuth: {
          id: this.auth.id,
        },
      }),
  };

  contacts = {
    all: () =>
      this.repos.contacts.findBy({
        DBAuth: {
          id: this.auth.id,
        },
      }),
    id: (id: string): Promise<DBContact | any> =>
      this.repos.contacts.findOneBy({
        id,
        DBAuth: {
          id: this.auth.id,
        },
      }),
  };

  messages = {
    all: async (jid: string): Promise<DBMessage[] | any> =>
      (
        await this.repos.messageDics.findOne({
          where: {
            jid,
            DBAuth: {
              id: this.auth.id,
            },
          },
          relations: ["messages"],
        })
      )?.messages,
    id: async (jid: string, msgId: string): Promise<DBMessage | any> =>
      (
        await this.repos.messageDics.findOne({
          where: {
            jid,
            DBAuth: {
              id: this.auth.id,
            },
          },
          relations: ["messages"],
        })
      )?.messages.find((x) => x.msgId === msgId),
  };

  groupMetadata = {
    all: () =>
      this.repos.groups.findBy({
        DBAuth: {
          id: this.auth.id,
        },
      }),
    id: (id: string): Promise<DBGroupMetadata | any> =>
      this.repos.groups.findOneBy({
        id,
        DBAuth: {
          id: this.auth.id,
        },
      }),
  };

  presence = {
    all: async (id: string): Promise<DBPresence[] | any> =>
      (
        await this.repos.presenceDics.findOne({
          where: {
            id,
            DBAuth: {
              id: this.auth.id,
            },
          },
          relations: ["presences"],
        })
      )?.presences,
    id: async (
      id: string,
      participant: string
    ): Promise<DBPresence | any> =>
      (
        await this.repos.presenceDics.findOne({
          where: {
            id,
            DBAuth: {
              id: this.auth.id,
            },
          },
          relations: ["presences"],
        })
      )?.presences.find((x) => x.participant === participant),
  };

  private contactsUpsert = async (newContacts: Partial<Contact>[]) => {
    // Mapeia contatos para o novo formato com suporte a LID
    const entities = newContacts.map(c => {
      // Novo formato de contato com suporte a LID
      const entity = {
        id: c.id, // Campo preferido pelo WhatsApp (pode ser LID ou PN)
        name: c.name,
        notify: c.notify,
        verifiedName: c.verifiedName,
        imgUrl: c.imgUrl,
        status: c.status,
        authId: this.auth.id      
      };
      
      return entity;
    }) as DBContact[];

    await this.retryOperation(async () => {
      return await this.repos.contacts.upsert(
        entities,
        ["id", "authId"]  // chave composta que você definiu no @Unique
      );
    });
  };

  private assertMessageList = async (jid: string) => {
    let messageDic = await this.repos.messageDics.findOne({
      where: {
        jid,
        DBAuth: { id: this.auth.id }
      },
    });

    if (!messageDic) {
      messageDic = await this.retryOperation(async () => {
        return await this.repos.messageDics.save({
          jid,
          DBAuth: { id: this.auth.id }
        });
      });
    }

    return messageDic;
  };

  /**
   * Método auxiliar para normalizar JID considerando sistema LID
   */
  private normalizeJid = (jid: string): string => {
    return jidNormalizedUser(jid);
  };

  /**
   * Método auxiliar para extrair JID da chave da mensagem considerando campos alternativos
   */
  private extractJidFromKey = (key: WAMessageKey): string => {
    // Prioriza remoteJidAlt se disponível (para DMs com LID)
    if (key.remoteJidAlt && this.isPnJid(key.remoteJidAlt)) {
      return this.normalizeJid(key.remoteJidAlt);
    }
    return this.normalizeJid(key.remoteJid!);
  };

  /**
   * Método auxiliar para extrair participant considerando participantAlt
   */
  private extractParticipantFromKey = (key: WAMessageKey): string | any => {
    // Prioriza participantAlt se disponível (para grupos com LID)
    if (key.participantAlt) {
      return this.normalizeJid(key.participantAlt);
    }
    return key.participant ? this.normalizeJid(key.participant) : undefined;
  };

  bind = (ev: BaileysEventEmitter) => {
    ev.on("connection.update", (update) => Object.assign(this.state, update));
    
    // Novo evento para mapeamentos LID
    ev.on("lid-mapping.update", async (mapping) => {
      console.log('LID mappings updated:', mapping);
      // Os mapeamentos são automaticamente salvos pelo AuthHandle
      // Aqui você pode adicionar lógica adicional se necessário
    });

    ev.on(
      "messaging-history.set",
      async ({
        chats: newChats,
        contacts: newContacts,
        messages: newMessages,
        isLatest,
      }) => {
        try {
          let messages = cloneDeep(newMessages);

          if (!isLatest) {
            messages = messages.filter(message =>
              ((typeof message.messageTimestamp == 'number' ? message.messageTimestamp : message.messageTimestamp.low) * 1000) >
              moment().subtract(1, 'days').valueOf()
            );
          }
          
          await this.contactsUpsert(newContacts);
          
          for (let index = 0; index < messages.length; index++) {
            const msg = messages[index];
            const jid = this.extractJidFromKey(msg.key);

            // Realiza a consulta diretamente no banco de dados para verificar se a mensagem já existe
            const existingMessage = await this.repos.messages.findOne({
              where: {
                msgId: msg.key.id,
                dictionary: {
                  jid,
                  DBAuth: { id: this.auth.id }
                },
              },
            });

            if (!existingMessage) {
              // Se a mensagem não existir, salva-a no banco de dados
              await this.repos.messages.save({
                ...(msg as any),
                msgId: msg.key?.id,
                dictionary: await this.assertMessageList(jid),
              });
              continue;
            }
            
            // Se a mensagem já existir, atualiza-a
            Object.assign(existingMessage, msg);
            await this.repos.messages.save(existingMessage);
          }
        } catch (error) {
          console.error(error)
        }
      }
    );

    ev.on("contacts.upsert", async (contacts) => {
      this.contactsUpsert(contacts);
    });

    ev.on("contacts.update", async (contacts) => {
      this.contactsUpsert(contacts);
    });

    ev.on("chats.upsert", async (newChats) => {
      try {
        const entities = newChats.map(c => ({
          id: c.id,
          conversationTimestamp: c.conversationTimestamp,
          unreadCount: c.unreadCount,
          authId: this.auth.id,
        }));
    
        // insere ou atualiza em lote
        await this.repos.chats.upsert(
          entities,
          ["id", "authId"]
        );
      } catch { }
    });

    ev.on("chats.update", async (updates) => {
      for (let update of updates) {
        var chat = await this.repos.chats.findOneBy({
          id: update.id!,
          DBAuth: { id: this.auth.id },
        });
        if (!chat) return;
        if (update.unreadCount! > 0) {
          update = { ...update };
          update.unreadCount = (chat.unreadCount || 0) + update.unreadCount!;
        }

        Object.assign(chat, update);
        await this.retryOperation(async () => {
          await this.repos.chats.save(chat);
        });
      }
    });

    ev.on("presence.update", async ({ id, presences: update }) => {
      var chat =
        (await this.repos.presenceDics.findOne({
          where: {
            id,
            DBAuth: { id: this.auth.id },
          },
          relations: ["presences"],
        })) ||
        ({
          id,
          presences: [],
          DBAuth: { id: this.auth.id },
        } as DBPresenceDic);

      Object.entries(update).forEach(([id, presence]) => {
        var participant = chat.presences.find((x) => x.participant === id);
        participant
          ? Object.assign(participant, presence)
          : chat.presences.push({
            ...presence,
            participant: id,
          } as any);
      });

      try {
        await this.retryOperation(async () => {
          await this.repos.presenceDics.save(chat);
        });
      } catch { }
    });

    ev.on(
      "chats.delete",
      async (deletions) =>
        !this.options.disableDelete.includes("chats") &&
        Promise.all(
          deletions.map((id) =>
            this.repos.chats.delete({
              id,
              DBAuth: { id: this.auth.id },
            })
          )
        )
    );

    ev.on("messages.upsert", async ({ messages: newMessages, type }) => {
      if (type !== "append" && type !== "notify") {
        return;
      }
      
      for (const msg of newMessages) {
        const jid = this.extractJidFromKey(msg.key);

        // Verifica se a mensagem já existe no dicionário
        const existingMessage = await this.repos.messages.findOne({
          where: {
            msgId: msg.key.id,
            dictionary: {
              jid,
              DBAuth: { id: this.auth.id }
            },
          },
        });

        if (!existingMessage) {
          // Se a mensagem não existir, salva-a no banco de dados
          await this.retryOperation(async () => {
            await this.repos.messages.save({
              ...(msg as any),
              msgId: msg.key?.id,
              dictionary: await this.assertMessageList(jid),
            });
          });

          // Emite um evento de atualização do chat se for uma notificação
          if (type === "notify") {
            const chat = await this.repos.chats.findOneBy({
              id: jid,
              DBAuth: { id: this.auth.id },
            });

            if (!chat) {
              ev.emit("chats.upsert", [
                {
                  id: jid,
                  conversationTimestamp: toNumber(msg.messageTimestamp),
                  unreadCount: 1,
                },
              ]);
            }
          }
        } else {
          // Se a mensagem já existir, atualiza-a
          Object.assign(existingMessage, msg);
          
          await this.retryOperation(async () => {
            await this.repos.messages.save(existingMessage);
          });
        }
      }
    });

    ev.on("messages.update", async (updates) => {
      for (const { update, key } of updates) {
        const jid = this.extractJidFromKey(key);

        // Verifica se a mensagem existe no dicionário
        const message = await this.repos.messages.findOne({
          where: {
            msgId: key.id,
            dictionary: {
              jid,
              DBAuth: { id: this.auth.id }
            },
          },
        });

        if (message) {
          // Se a mensagem existir, atualiza-a
          Object.assign(message, update);
          await this.retryOperation(async () => {
            await this.repos.messages.save(message);
          });
        }
      }
    });

    ev.on("messages.delete", async (item) => {
      if (this.options.disableDelete.includes("messages")) return;
      if ("all" in item) {
        const dictionary = await this.repos.messageDics.findOne({
          where: {
            jid: item.jid,
            DBAuth: { id: this.auth.id },
          },
          relations: ["messages"],
        });
        if (!dictionary) return;
        this.repos.messages.remove(dictionary.messages);
      } else {
        const jid = this.extractJidFromKey(item.keys[0]);
        const dictionary = await this.repos.messageDics.findOne({
          where: {
            jid,
            DBAuth: { id: this.auth.id },
          },
          relations: ["messages"],
        });
        if (!dictionary) return;
        const idSet = new Set(item.keys.map((k) => k.id));
        await this.repos.messages.remove(
          dictionary.messages.filter((msg) =>
            Array.from(idSet).includes(msg.msgId)
          )
        );
      }
    });

    ev.on("groups.update", async (updates) => {
      for (const update of updates) {
        const id = update.id!;
        let group = await this.repos.groups.findOneBy({
          id,
          DBAuth: { id: this.auth.id },
        });
        if (!group) return;
        Object.assign(group, update);
        await this.repos.groups.save(group);
      }
    });

    ev.on("group-participants.update", async ({ id, participants, action }) => {
      const metadata = await this.repos.groups.findOneBy({
        id,
        DBAuth: { id: this.auth.id },
      });
      if (!metadata) return;
      
      switch (action) {
        case "add":
          metadata.participants.push(
            ...participants.map((id) => ({
              id,
              isAdmin: false,
              isSuperAdmin: false,
            }))
          );
          break;
        case "demote":
        case "promote":
          metadata.participants.forEach(
            (participant) =>
              participants.includes(participant.id) &&
              (participant.isAdmin = action === "promote")
          );
          break;
        case "remove":
          metadata.participants = metadata.participants.filter(
            (p) => !participants.includes(p.id)
          );
          break;
      }
      await this.repos.groups.save(metadata);
    });

    ev.on("message-receipt.update", async (updates) => {
      for (const { key, receipt } of updates) {
        const jid = this.extractJidFromKey(key);
        const dictionary = await this.repos.messageDics.findOne({
          where: {
            jid,
            DBAuth: { id: this.auth.id },
          },
          relations: ["messages"],
        });
        if (!dictionary) return;
        const msg = dictionary.messages.find((x) => x.key.id === key.id!);
        if (!msg) continue;
        updateMessageWithReceipt(msg, receipt);
        
        await this.retryOperation(async () => {
          await this.repos.messageDics.save(dictionary);
        });
      }
    });

    ev.on("messages.reaction", async (reactions) => {
      for (const { key, reaction } of reactions) {
        const jid = this.extractJidFromKey(key);
        const dictionary = await this.repos.messageDics.findOne({
          where: {
            jid,
            DBAuth: { id: this.auth.id },
          },
          relations: ["messages"],
        });
        if (!dictionary) return;
        const msg = dictionary.messages.find((x) => x.key.id === key.id!);
        if (!msg) continue;
        updateMessageWithReaction(msg, reaction);
        await this.retryOperation(async () => {
          await this.repos.messageDics.save(dictionary);
        });
      }
    });
  };

  loadMessages = async (
    jid: string,
    count: number,
    cursor: WAMessageCursor
  ): Promise<DBMessage[]> => {
    const dictionary = await this.repos.messageDics.findOne({
      where: {
        jid,
        DBAuth: { id: this.auth.id }
      },
      relations: ["messages"],
    });

    if (!dictionary) {
      return [];
    }

    const mode = !cursor || "before" in cursor ? "before" : "after";
    const cursorKey = cursor && "before" in cursor ? cursor.before : cursor?.['after'];

    const cursorValue = cursorKey
      ? dictionary.messages.find((x) => x.msgId === cursorKey.id!)
      : undefined;

    let messages: DBMessage[] = [];

    if (mode === "before" && (!cursorKey || cursorValue)) {
      if (cursorValue) {
        const msgIdx = dictionary.messages.findIndex((m) => m.key.id === cursorKey?.id);
        messages = dictionary.messages.slice(Math.max(0, msgIdx - count), msgIdx);
      } else {
        messages = dictionary.messages;
      }

      const diff = count - messages.length;

      if (diff > 0) {
        const remainingMessages = await this.repos.messages.find({
          where: {
            id: In(dictionary.messages.map((msg) => msg.id)),
            msgId: LessThan(messages[0].msgId),
          },
          order: {
            msgId: "DESC",
          },
          take: diff,
        });
        messages = remainingMessages.concat(messages);
      }
    }

    return messages;
  };

  loadMessage = async (
    jid: string,
    id: string,
    sock?: WASocket | any
  ): Promise<DBMessage | any> => {
    var message = await this.repos.messages.findOne({
      where: {
        msgId: id,
        dictionary: {
          jid,
          DBAuth: { id: this.auth.id }
        },
      },
    });
    // console.log('loadMessage', jid);
    if (!message && sock) {
      const onWhatsApp = await sock?.onWhatsApp(jid.replace(/[^\d-]/g, '')).catch((error) =>
        console.log('loadMessage onWhatsApp error', error)
      );
      // console.log('loadMessage onWhatsApp', onWhatsApp);
      onWhatsApp && (message = await this.retryOperation(async () => {
        return  await this.repos.messages.findOne({
          where: {
            msgId: id,
            dictionary: {
              jid: onWhatsApp[0].lid,
              DBAuth: { id: this.auth.id }
            },
          },
        })
      }));
    }

    return message;
  };

  mostRecentMessage = async (jid: string): Promise<DBMessage | any> => {
    const message = await this.repos.messages.findOne({
      where: {
        dictionary: {
          jid,
          DBAuth: { id: this.auth.id }
        },
      },
      order: {
        msgId: "DESC",
      },
    });

    return message;
  };

  fetchImageUrl = async (
    jid: string,
    sock: WASocket | any
  ): Promise<string> => {
    const contact = await this.repos.contacts.findOne({ where: { id: jid } });
    if (!contact) return sock?.profilePictureUrl(jid);
    if (typeof contact.imgUrl === "undefined")
      await this.repos.contacts.save({
        ...contact,
        imgUrl: await sock?.profilePictureUrl(jid),
      });
    return contact.imgUrl;
  };

  fetchGroupMetadata = async (
    jid: string,
    sock: WASocket | any
  ): Promise<DBGroupMetadata | any> => {
    var group = await this.repos.groups.findOneBy({
      id: jid,
      DBAuth: { id: this.auth.id },
    });
    if (!group) {
      const metadata = await sock?.groupMetadata(jid).catch((error) =>
        console.log('fetchGroupMetadata groupMetadata error', error)
      );
      metadata && (group = await this.retryOperation(async () => {
        return await this.repos.groups.save({
          ...metadata,
          DBAuth: { id: this.auth.id },
        })
      }));
    }

    return group;
  };

  fetchMessageReceipts = async ({ remoteJid, id, remoteJidAlt }: WAMessageKey): Promise<DBMessage["userReceipt"] | any> => {
    // Usa remoteJidAlt se disponível
    const jid = remoteJidAlt || remoteJid;
    
    const receipt = await this.repos.messages.findOne({
      where: {
        msgId: id,
        dictionary: {
          jid,
          DBAuth: { id: this.auth.id }
        },
      },
      select: ["userReceipt"],
    });

    return receipt?.userReceipt;
  };

  /**
   * Método auxiliar para verificar se um JID é um PN (Phone Number)
   */
  isPnJid = (jid: string): boolean => {
    return isPnUser(jid);
  };

  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 100
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (error.code === 'SQLITE_BUSY' && attempt < maxRetries) {
          console.warn(`Database busy, retrying (${attempt}/${maxRetries})...`)
          await this.sleep(delay * attempt); // Backoff exponencial
          continue;
        }
        throw error;
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}