import { useEffect } from 'react';
import { getSocket } from '../getSocket';
import { Message as MessageResponse } from '../models';
import { InfiniteData, useQueryClient } from 'react-query';
import { userStore } from '../../stores/userStore';
import { channelStore } from '../../stores/channelStore';

type WSMessage =
  | { action: 'new_message' | 'edit_message'; data: MessageResponse }
  | { action: 'addToTyping' | 'removeFromTyping' | 'delete_message'; data: string };

export function useMessageSocket(channelId: string, key: string) {
  const current = userStore((state) => state.current);
  const store = channelStore();
  const cache = useQueryClient();

  useEffect((): any => {
    store.reset();
    const socket = getSocket();

    socket.send(JSON.stringify({ action: 'joinChannel', room: channelId }));

    socket.addEventListener('message', (event) => {
      const response: WSMessage = JSON.parse(event.data);
      switch (response.action) {
        case 'new_message': {
          cache.setQueryData<InfiniteData<MessageResponse[]>>(key, (d) => {
            d!.pages[0].unshift(response.data);
            return d!;
          });
          break;
        }

        case 'edit_message': {
          const editMessage = response.data;
          cache.setQueryData<InfiniteData<MessageResponse[]>>(key, (d) => {
            let index = -1;
            let editId = -1;
            d!.pages.forEach((p, i) => {
              editId = p.findIndex((m) => m.id === editMessage.id);
              if (editId !== -1) index = i;
            });
            if (index !== -1 && editId !== -1) {
              d!.pages[index][editId].text = editMessage.text;
              d!.pages[index][editId].updatedAt = editMessage.updatedAt;
            }
            return d!;
          });
          break;
        }

        case 'delete_message': {
          const messageId = response.data;
          cache.setQueryData<InfiniteData<MessageResponse[]>>(key, (d) => {
            let index = -1;
            d!.pages.forEach((p, i) => {
              if (p.findIndex((m) => m.id === messageId) !== -1) index = i;
            });
            if (index !== -1) d!.pages[index] = d!.pages[index].filter((m) => m.id !== messageId);
            return d!;
          });
          break;
        }

        case 'addToTyping': {
          const username = response.data;
          if (username !== current?.username) store.addTyping(username);
          break;
        }

        case 'removeFromTyping': {
          const username = response.data;
          if (username !== current?.username) store.removeTyping(username);
          break;
        }
      }
    });

    return () => {
      socket.send(JSON.stringify({ action: 'leaveRoom', room: channelId }));

      socket.close();
    };
    // eslint-disable-next-line
  }, [channelId, cache, key, current]);
}
