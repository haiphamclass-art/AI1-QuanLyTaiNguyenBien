import React from 'react';

// Loading component that shows the spinning icon and message
const Loading = () => {
  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <p>Spinning:</p>
      <i
        className="fa fa-circle-o-notch fa-spin"
        style={{ fontSize: '24px' }}
      ></i>
      <p>Đang tải...</p>
    </div>
  );
};

export default Loading;
