FROM python:3.10-slim

WORKDIR /app

# Latest releases available at https://github.com/aptible/supercronic/releases
ARG TARGETARCH
ENV SUPERCRONIC_VERSION=v0.2.39

RUN set -ex && \
    sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources \
    || sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    case ${TARGETARCH} in \
    amd64) \
    export SUPERCRONIC_URL_PRIMARY=https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-amd64; \
    export SUPERCRONIC_SHA1SUM=c98bbf82c5f648aaac8708c182cc83046fe48423; \
    export SUPERCRONIC=supercronic-linux-amd64; \
    ;; \
    arm64) \
    export SUPERCRONIC_URL_PRIMARY=https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-arm64; \
    export SUPERCRONIC_SHA1SUM=5ef4ccc3d43f12d0f6c3763758bc37cc4e5af76e; \
    export SUPERCRONIC=supercronic-linux-arm64; \
    ;; \
    *) \
    echo "Unsupported architecture: ${TARGETARCH}"; \
    exit 1; \
    ;; \
    esac && \
    export SUPERCRONIC_URL_MIRROR=https://ghproxy.com/${SUPERCRONIC_URL_PRIMARY} && \
    echo "Downloading supercronic for ${TARGETARCH} from ${SUPERCRONIC_URL_PRIMARY} (mirror fallback: ${SUPERCRONIC_URL_MIRROR})" && \
    python - <<'PY'
import hashlib
import os
import shutil
import subprocess
import sys
import time
import urllib.request


def download(url: str, out_path: str, timeout_s: int = 60) -> str:
    h = hashlib.sha1()
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8"})
    with urllib.request.urlopen(req, timeout=timeout_s) as resp, open(out_path, "wb") as f:
        while True:
            chunk = resp.read(1024 * 64)
            if not chunk:
                break
            f.write(chunk)
            h.update(chunk)
    return h.hexdigest()


primary = os.environ["SUPERCRONIC_URL_PRIMARY"]
mirror = os.environ["SUPERCRONIC_URL_MIRROR"]
local_bin = os.environ["SUPERCRONIC"]
expected = os.environ["SUPERCRONIC_SHA1SUM"].lower()

urls = [primary, mirror]
ok = False
for attempt in range(1, 4):
    print(f"Download attempt {attempt}/3")
    for url in urls:
        print(f"Trying {url}")
        try:
            sha1 = download(url, local_bin, timeout_s=60)
            if sha1.lower() != expected:
                raise ValueError(f"sha1 mismatch: expected {expected}, got {sha1}")
            ok = True
            break
        except Exception as e:
            print(f"Download failed: {e}", file=sys.stderr)
    if ok:
        break
    time.sleep(2)

if not ok:
    print("All download attempts failed", file=sys.stderr)
    sys.exit(1)

os.chmod(local_bin, 0o755)
target = f"/usr/local/bin/{local_bin}"
shutil.move(local_bin, target)

link = "/usr/local/bin/supercronic"
try:
    os.remove(link)
except FileNotFoundError:
    pass
os.symlink(target, link)

subprocess.run([link, "-version"], check=True)
PY
# 安装依赖
COPY requirements.txt .
# 优先安装 CPU版 PyTorch (使用清华源加速)
RUN pip install --no-cache-dir torch torchvision torchaudio -i https://pypi.tuna.tsinghua.edu.cn/simple
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY docker/manage.py .
COPY hotnews/ ./hotnews/
COPY mcp_server/ ./mcp_server/

# 复制 entrypoint.sh 并强制转换为 LF 格式
COPY docker/entrypoint.sh /entrypoint.sh.tmp
RUN sed -i 's/\r$//' /entrypoint.sh.tmp && \
    mv /entrypoint.sh.tmp /entrypoint.sh && \
    chmod +x /entrypoint.sh && \
    chmod +x manage.py && \
    mkdir -p /app/config /app/output

ENV PYTHONUNBUFFERED=1 \
    CONFIG_PATH=/app/config/config.yaml \
    FREQUENCY_WORDS_PATH=/app/config/frequency_words.txt

ENTRYPOINT ["/entrypoint.sh"]