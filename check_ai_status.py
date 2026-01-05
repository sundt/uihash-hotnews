#!/usr/bin/env python3
"""
快速检查RSS AI分类系统运行状态

用法:
    python check_ai_status.py
"""

import os
import sqlite3
import time
from datetime import datetime
from pathlib import Path


def check_env_config():
    """检查环境变量配置"""
    print("🔧 环境变量配置:")
    
    enabled = os.environ.get("TREND_RADAR_MB_AI_ENABLED", "0")
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    model = os.environ.get("TREND_RADAR_MB_AI_MODEL", "qwen-plus")
    batch_size = os.environ.get("TREND_RADAR_MB_AI_BATCH_SIZE", "20")
    max_per_hour = os.environ.get("TREND_RADAR_MB_AI_MAX_PER_HOUR", "200")
    
    print(f"   AI分类启用: {'✅ 是' if enabled in ('1', 'true', 'yes') else '❌ 否'} (TREND_RADAR_MB_AI_ENABLED={enabled})")
    print(f"   API密钥配置: {'✅ 已配置' if api_key else '❌ 未配置'} (长度: {len(api_key)})")
    print(f"   模型: {model}")
    print(f"   批量大小: {batch_size}")
    print(f"   每小时限额: {max_per_hour}")
    
    is_enabled = enabled in ('1', 'true', 'yes') and bool(api_key)
    return is_enabled


def check_database():
    """检查数据库状态"""
    print("\n📊 数据库状态:")
    
    db_path = Path("output/online.db")
    if not db_path.exists():
        print("   ❌ 数据库不存在 (output/online.db)")
        return False
    
    try:
        conn = sqlite3.connect(str(db_path))
        
        # 检查表是否存在
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='rss_entry_ai_labels'"
        )
        if not cur.fetchone():
            print("   ❌ AI标注表不存在")
            return False
        
        # 总标注数
        cur = conn.execute("SELECT COUNT(*) FROM rss_entry_ai_labels")
        total = cur.fetchone()[0]
        
        # 最近标注
        cur = conn.execute(
            "SELECT MAX(labeled_at), prompt_version FROM rss_entry_ai_labels"
        )
        row = cur.fetchone()
        last_ts = row[0] if row else None
        prompt_ver = row[1] if row and len(row) > 1 else None
        
        if not last_ts:
            print("   ⚠️  数据库表存在但无标注数据")
            return False
        
        last_time = datetime.fromtimestamp(last_ts)
        time_ago = int(time.time() - last_ts)
        
        print(f"   ✅ 总标注数: {total}")
        print(f"   ✅ 最后标注: {last_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"   ✅ 距今: {time_ago // 60} 分钟前" if time_ago < 3600 else f"   ⚠️  距今: {time_ago // 3600} 小时前")
        print(f"   ✅ Prompt版本: {prompt_ver or 'unknown'}")
        
        # 最近1小时的标注
        hour_ago = int(time.time()) - 3600
        cur = conn.execute(
            "SELECT COUNT(*) FROM rss_entry_ai_labels WHERE labeled_at >= ?",
            (hour_ago,)
        )
        recent = cur.fetchone()[0]
        print(f"   {'✅' if recent > 0 else '⚠️ '} 最近1小时: {recent} 条")
        
        conn.close()
        
        # 判断是否活跃
        is_active = time_ago < 600  # 10分钟内有标注
        return is_active
        
    except Exception as e:
        print(f"   ❌ 数据库检查失败: {str(e)}")
        return False


def check_logs():
    """检查日志"""
    print("\n📝 日志检查:")
    
    log_files = [
        "logs/viewer.log",
        "logs/20260105.txt"  # 今天的日志
    ]
    
    found = False
    for log_file in log_files:
        log_path = Path(log_file)
        if log_path.exists():
            # 读取最后100行
            try:
                with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                    lines = f.readlines()
                    last_lines = lines[-100:] if len(lines) > 100 else lines
                    
                    # 搜索AI相关日志
                    mb_ai_lines = [l for l in last_lines if 'mb_ai' in l.lower()]
                    
                    if mb_ai_lines:
                        found = True
                        print(f"   ✅ 在 {log_file} 找到AI分类日志:")
                        
                        # 显示最近3条
                        for line in mb_ai_lines[-3:]:
                            print(f"      {line.strip()}")
                        break
            except Exception as e:
                print(f"   ⚠️  无法读取 {log_file}: {str(e)}")
    
    if not found:
        print("   ⚠️  未找到AI分类相关日志")
        print("   提示: 可能系统刚启动或AI分类未启用")
    
    return found


def main():
    print("=" * 70)
    print("RSS AI分类系统状态检查")
    print("=" * 70)
    
    # 检查环境配置
    env_ok = check_env_config()
    
    # 检查数据库
    db_ok = check_database()
    
    # 检查日志
    log_ok = check_logs()
    
    # 总结
    print("\n" + "=" * 70)
    print("📊 状态总结:")
    print("-" * 70)
    
    if env_ok and db_ok:
        print("✅ AI分类系统正在运行")
        print("   - 环境变量已配置")
        print("   - 数据库有活跃标注")
        if log_ok:
            print("   - 日志显示正常运行")
    elif env_ok and not db_ok:
        print("⚠️  AI分类系统已配置但可能未运行或刚启动")
        print("   - 环境变量已配置")
        print("   - 数据库无最近标注")
        print("   建议: 等待几分钟后重新检查，或查看日志确认")
    elif not env_ok:
        print("❌ AI分类系统未启用")
        print("   原因: 环境变量未配置")
        print("\n   启用方法:")
        print("   export TREND_RADAR_MB_AI_ENABLED=1")
        print("   export DASHSCOPE_API_KEY=your_api_key_here")
        print("   然后重启viewer服务")
    else:
        print("❓ 状态不明确")
        print("   建议: 查看完整日志或重启服务")
    
    print("=" * 70)


if __name__ == "__main__":
    main()
