import React, { useEffect, useRef, useState } from 'react';
import { SafeAreaView, View, TextInput, Button, FlatList, Text, ActivityIndicator } from 'react-native';
import io, { Socket } from 'socket.io-client';

const API_BASE_URL = 'http://localhost:3000';
const MESSAGE_LIMIT = 30;

type Msg = {
  _id?: string;
  roomId: string;
  senderId?: string;
  clientMessageId: string;
  type: 'text' | 'image';
  text?: string;
  fileUrl?: string;
  createdAt?: string;
  status?: 'sent' | 'delivered';
};

function ulid() {
  // Tiny ULID-ish ID (not spec-true, but good enough for client IDs)
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function ChatClient() {
  const [roomId, setRoomId] = useState('demo-room-1');
  const [token, setToken] = useState('DUMMY_JWT_WITH_sub'); // Replace with a real JWT
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Fetch initial messages
  const fetchInitialMessages = async (room: string, authToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/messages?roomId=${room}&limit=${MESSAGE_LIMIT}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.status}`);
      }

      const data: Msg[] = await response.json();
      // API returns newest first: [newest, ..., oldest]
      // Keep this order for inverted FlatList (newest at bottom, oldest at top)
      setMsgs(data);
      setHasMore(data.length >= MESSAGE_LIMIT);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      setError(error instanceof Error ? error.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  // Load more messages (pagination)
  const loadMoreMessages = async () => {
    if (!hasMore || isLoadingMore || msgs.length === 0) return;

    setIsLoadingMore(true);
    try {
      // Array is [newest, ..., oldest], so oldest is at the end
      const oldestMsg = msgs[msgs.length - 1];
      const before = oldestMsg?.createdAt;

      if (!before) {
        setIsLoadingMore(false);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/messages?roomId=${roomId}&limit=${MESSAGE_LIMIT}&before=${before}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data: Msg[] = await response.json();

      if (data.length > 0) {
        // API returns [less_old, ..., very_old] (newest first among older messages)
        // Append to end: [newest, ..., oldest, less_old, ..., very_old]
        setMsgs(prev => {
          const existingIds = new Set(prev.map(m => m.clientMessageId));
          const newMessages = data.filter(m => !existingIds.has(m.clientMessageId));
          return [...prev, ...newMessages];
        });
        setHasMore(data.length >= MESSAGE_LIMIT);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Initial load when roomId or token changes
  useEffect(() => {
    if (roomId && token) {
      setMsgs([]);
      setHasMore(true);
      setError(null);
      fetchInitialMessages(roomId, token);
    }
  }, [roomId, token]);

  // WebSocket connection
  useEffect(() => {
    const socket = io(API_BASE_URL, {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join', { roomId });
    });

    socket.on('message', (m: Msg) => {
      setMsgs(prev => {
        // If it's an ACKed version of a pending message, replace by clientMessageId
        const idx = prev.findIndex(p => p.clientMessageId === m.clientMessageId);
        if (idx >= 0) {
          const clone = [...prev];
          clone[idx] = { ...clone[idx], ...m }; // merge server fields
          return clone;
        }
        // New message: prepend to start (array is [newest, ..., oldest])
        // With inverted FlatList, this shows at the bottom (chat convention)
        return [m, ...prev];
      });
    });

    socket.on('ack', ({ clientMessageId }) => {
      setMsgs(prev => prev.map(p => p.clientMessageId === clientMessageId ? { ...p, status: 'delivered' } : p));
    });

    return () => {
      socket.disconnect();
    };
  }, [roomId, token]);

  const sendMsg = () => {
    if (!text.trim()) return;
    const clientMessageId = ulid();
    const optimistic: Msg = {
      roomId,
      clientMessageId,
      type: 'text',
      text,
      status: 'sent',
    };
    // Optimistic update: add message immediately to UI
    // Prepend to start since array is [newest, ..., oldest]
    setMsgs(prev => [optimistic, ...prev]);
    socketRef.current?.emit('message', { roomId, text, clientMessageId });
    setText('');
  };

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
        <TextInput
          placeholder="roomId"
          value={roomId}
          onChangeText={setRoomId}
          style={{ borderWidth: 1, flex: 1, marginRight: 8, padding: 8 }}
        />
        <TextInput
          placeholder="JWT token"
          value={token}
          onChangeText={setToken}
          style={{ borderWidth: 1, flex: 2, padding: 8 }}
        />
      </View>

      <View style={{ flexDirection: 'row' }}>
        <TextInput
          placeholder="Type a message"
          value={text}
          onChangeText={setText}
          style={{ borderWidth: 1, flex: 1, marginRight: 8, padding: 8 }}
        />
        <Button title="Send" onPress={sendMsg} />
      </View>

      {loading && msgs.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
          <Text>Loading messages...</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: 'red', marginBottom: 10 }}>Error: {error}</Text>
          <Button title="Retry" onPress={() => fetchInitialMessages(roomId, token)} />
        </View>
      ) : msgs.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#999' }}>No messages yet</Text>
          <Text style={{ color: '#999', fontSize: 12 }}>Send a message to start the conversation</Text>
        </View>
      ) : (
        <FlatList
          data={msgs}
          keyExtractor={(item) => item.clientMessageId}
          renderItem={({ item }) => (
            <View style={{ paddingVertical: 8 }}>
              <Text>{item.text}</Text>
              <Text style={{ fontSize: 12, color: '#666' }}>{item.status ?? 'sent'}</Text>
            </View>
          )}
          inverted
          onEndReached={loadMoreMessages}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isLoadingMore ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator />
                <Text style={{ marginTop: 8, color: '#666' }}>Loading more...</Text>
              </View>
            ) : !hasMore && msgs.length > 0 ? (
              <View style={{ padding: 16, alignItems: 'center' }}>
                <Text style={{ color: '#999', fontSize: 12 }}>No more messages</Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}
