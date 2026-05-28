import React from 'react';
import type { Room } from '@clos/shared-types';

interface Props {
  room: Room;
  style?: React.CSSProperties;
}

export function RoomPhoto({ room, style }: Props) {
  if (room.photoUrl) {
    return (
      <div className="photo" style={style}>
        <img src={room.photoUrl} alt={room.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div className={`photo tint-${room.photoTint}`} style={style}>
      <span className="photo-label">{room.roomId}</span>
    </div>
  );
}
