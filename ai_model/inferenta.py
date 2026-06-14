import socket
import struct
import json
import cv2
import torch
import torch.nn as nn
import numpy as np
import mediapipe as mp
from PIL import Image
from torchvision import transforms
from torchvision.models import resnet18
from collections import deque

HOST = '0.0.0.0'
PORT = 12345
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
MODEL_PATH = "best_cnn_lstm_fold2v2.pth"
EMOTIONS = ['Anger', 'Contempt', 'Disgust', 'Fear', 'Happiness', 'Sadness', 'Surprise']
WINDOW_SIZE = 10


class EmotionCNN_LSTM(nn.Module):
    def __init__(self, num_classes=7, hidden_dim=256, num_layers=1, dropout=0.5):
        super().__init__()
        resnet = resnet18(weights=None)
        self.cnn = nn.Sequential(*list(resnet.children())[:-1])
        self.lstm = nn.LSTM(input_size=512, hidden_size=hidden_dim, num_layers=1, batch_first=True)
        self.fc = nn.Sequential(
            nn.Dropout(p=dropout),
            nn.Linear(hidden_dim, 128),
            nn.ReLU(),
            nn.Dropout(p=dropout * 0.5),
            nn.Linear(128, num_classes)
        )

    def forward(self, x):
        B, T, C, H, W = x.shape
        c_in = x.contiguous().view(B * T, C, H, W)
        cnn_out = self.cnn(c_in).view(B, T, -1)
        lstm_out, (h_n, c_n) = self.lstm(cnn_out)
        logits = self.fc(h_n[-1, :, :])
        return logits


inference_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.Grayscale(num_output_channels=3),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

mp_face_detection = mp.solutions.face_detection
face_detector = mp_face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.5)


def get_face_crop(image_np, margin=0.2):
    h, w, _ = image_np.shape
    rgb_frame = cv2.cvtColor(image_np, cv2.COLOR_BGR2RGB)
    results = face_detector.process(rgb_frame)
    if not results.detections: return None
    bbox = results.detections[0].location_data.relative_bounding_box
    xmin, ymin = int(bbox.xmin * w), int(bbox.ymin * h)
    bw, bh = int(bbox.width * w), int(bbox.height * h)
    mx, my = int(bw * margin), int(bh * margin)
    x1, y1 = max(0, xmin - mx), max(0, ymin - my)
    x2, y2 = min(w, xmin + bw + mx), min(h, ymin + bh + my)
    return image_np[y1:y2, x1:x2]

def start_inference_server():
    model = EmotionCNN_LSTM(num_classes=7).to(DEVICE)
    model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
    model.eval()
    print(f"[PYTHON] Model loaded on {DEVICE}. Waiting for connections on {HOST}:{PORT}...")

    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind((HOST, PORT))
    server_socket.listen(1)

    # Sliding Window for frames
    frame_buffer = deque(maxlen=WINDOW_SIZE)

    while True:
        conn, addr = server_socket.accept()
        print(f"[PYTHON] Connected to client: {addr}")

        try:
            while True:
                # read the image length (4 bytes, unsigned int big-endian)
                len_data = conn.recv(4)
                if not len_data: break
                img_len = struct.unpack('>I', len_data)[0]

                # read the JPEG image data
                img_data = b''
                while len(img_data) < img_len:
                    chunk = conn.recv(min(img_len - len(img_data), 4096))
                    if not chunk: break
                    img_data += chunk

                # image processing
                nparr = np.frombuffer(img_data, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                if frame is not None:
                    face = get_face_crop(frame)
                    if face is not None:
                        face_rgb = cv2.cvtColor(face, cv2.COLOR_BGR2RGB)
                        face_pil = Image.fromarray(face_rgb)
                        tensor_frame = inference_transform(face_pil)
                        frame_buffer.append(tensor_frame)

                # inference (if enough frames)
                if len(frame_buffer) == WINDOW_SIZE:
                    input_tensor = torch.stack(list(frame_buffer)).unsqueeze(0).to(DEVICE)
                    with torch.no_grad():
                        logits = model(input_tensor)
                        probs = torch.nn.functional.softmax(logits, dim=1)[0]

                    # build the JSON response
                    # send all probabilities to the frontend
                    prob_dict = {EMOTIONS[i]: float(probs[i]) for i in range(len(EMOTIONS))}
                    response = {
                        "status": "ok",
                        "probabilities": prob_dict
                    }
                else:
                    response = {"status": "buffering", "count": len(frame_buffer)}

                # send the response + newline (\n) as Node.js expects
                conn.sendall((json.dumps(response) + "\n").encode('utf-8'))

        except Exception as e:
            print(f"[PYTHON] Error: {e}")
        finally:
            conn.close()
            frame_buffer.clear()
            print("[PYTHON] Connection closed. Reset buffer.")


if __name__ == "__main__":
    try:
        start_inference_server()
    except KeyboardInterrupt:
        print("\n[PYTHON] Shutdown detected. Shutting down the server...")
    finally:
        print("[PYTHON] Server stopped successfully.")