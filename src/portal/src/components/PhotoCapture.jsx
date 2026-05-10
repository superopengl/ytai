import { useRef } from 'react';
import { Button, Space, Typography } from 'antd';
import { CameraOutlined, UploadOutlined } from '@ant-design/icons';

export default function PhotoCapture({ onSelectFile }) {
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);

  function handleChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onSelectFile(file);
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        padding: 32,
        textAlign: 'center'
      }}
    >
      <Typography.Title level={2} style={{ margin: 0 }}>
        Snap or upload your worksheet
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ maxWidth: 420, fontSize: 16 }}>
        I'll take a look at the page, find the questions, and we can work through anything
        you're stuck on together.
      </Typography.Paragraph>
      <Space size="large" wrap>
        <Button
          type="primary"
          size="large"
          icon={<CameraOutlined />}
          onClick={() => cameraRef.current?.click()}
        >
          Take Photo
        </Button>
        <Button size="large" icon={<UploadOutlined />} onClick={() => uploadRef.current?.click()}>
          Upload Image
        </Button>
      </Space>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleChange}
      />
      <input ref={uploadRef} type="file" accept="image/*" hidden onChange={handleChange} />
    </div>
  );
}
