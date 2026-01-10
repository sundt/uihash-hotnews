# Deployment Configuration

## Production Server

### Server Information
- **Host**: 120.77.222.205
- **User**: root
- **SSH Port**: 52222
- **Project Path**: ~/hotnews
- **SSH Config Alias**: (optional) `hotnews-prod`

### Deployment Method
- **Primary**: Git pull + service restart
- **Backup**: rsync for quick fixes

### Service Management
```bash
# Check service status
systemctl status hotnews  # if using systemd
# or
docker-compose ps            # if using docker

# View logs
journalctl -u hotnews -f  # systemd
docker-compose logs -f       # docker
tail -f ~/hotnews/logs/*.log # direct python
```

### Quick Deploy Commands

#### Git-based Deployment (Recommended)
```bash
ssh -p 52222 root@120.77.222.205 'cd ~/hotnews && git pull && systemctl restart hotnews'
```

#### Docker Deployment
```bash
ssh -p 52222 root@120.77.222.205 'cd ~/hotnews && git pull && cd docker && docker-compose restart hotnews'
```

#### Direct File Sync (Hot Fix Only)
```bash
# Sync single file
rsync -avz -e "ssh -p 52222" hotnews/web/server.py root@120.77.222.205:~/hotnews/hotnews/web/

# Restart service
ssh -p 52222 root@120.77.222.205 'systemctl restart hotnews'
```

## Testing Endpoints

After deployment, verify:
```bash
# Health check
curl http://120.77.222.205:8080/health

# Test Chinese encoding fix
curl http://120.77.222.205:8080/api/news | python3 -m json.tool | grep -A 2 "掘金"

# Web interface
open http://120.77.222.205:8080/viewer
```

## Rollback Procedure

If deployment fails:
```bash
ssh -p 52222 root@120.77.222.205 'cd ~/hotnews && git reset --hard HEAD~1 && systemctl restart hotnews'
```

## Emergency Restore (Offline Image Tarball)

Use this runbook when production is down or a deploy introduces a bug and you need to recover quickly without relying on Docker Hub.

### Assumptions
- You have an offline image tarball like `V1.0.1.tar.gz`.
- The tarball contains the versioned images tagged as `v1.0.1` (lowercase `v`).
- Production server: `root@120.77.222.205:52222`, project path `~/hotnews`.

### Fast Restore (Recommended)

1) Load images on the server (no registry required):

```bash
gzip -dc V1.0.1.tar.gz | ssh -p 52222 root@120.77.222.205 "docker load"
```

2) Switch the server to the target version and start services:

```bash
ssh -p 52222 root@120.77.222.205 "cd ~/hotnews/docker && \
printf 'HOTNEWS_TAG=v1.0.1\nHOTNEWS_MCP_TAG=v1.0.1\nHOTNEWS_VIEWER_TAG=v1.0.1\nVIEWER_PORT=8090\n' > .env && \
docker compose up -d hotnews hotnews-mcp hotnews-viewer"
```

3) Verify:

```bash
ssh -p 52222 root@120.77.222.205 "curl -fsS http://127.0.0.1:8090/health && echo"
curl -fsS https://hot.uihash.com/health && echo
```

### Alternative: Use sync-to-server.sh (Offline Deploy)

If the tarball is loaded into your local Docker first, you can reuse the deployment script:

```bash
gzip -dc V1.0.1.tar.gz | docker load
bash sync-to-server.sh v1.0.1 --offline --force
```

### Data vs Image Backup

Image tarballs recover the runtime quickly, but persistent state still lives on the server in `~/hotnews/config` and `~/hotnews/output`.

To snapshot server state to a local file:

```bash
ssh -p 52222 root@120.77.222.205 "tar -czf - -C ~/hotnews config output" > hotnews-data-$(date +%F).tar.gz
```

## Security Notes
- SSH key authentication required
- Firewall: only ports 22, 8080 exposed
- Regular security updates via `apt update && apt upgrade`

## Maintenance

### Backup Schedule
- Database: Daily at 2:00 AM (cron)
- Configuration: Weekly backup to S3

### Log Rotation
- Logs older than 30 days auto-deleted
- Max log size: 100MB per file

## Related Documentation
- [Setup Guide](../README.md)
- [Configuration](../config/config.yaml)
- [Docker Setup](../docker/README.md)
