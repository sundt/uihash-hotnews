#!/usr/bin/env python3
"""
RSS AI分类测试脚本

用法:
    python test_ai_classification.py

功能:
    1. 测试不同类型的新闻标题分类效果
    2. 查看分类统计信息
"""

import asyncio
import json
from trendradar.web.rss_scheduler import mb_ai_test_classification, mb_ai_get_classification_stats
from trendradar.web.db_online import get_online_db_conn


# 测试用例：涵盖不同类型的新闻
TEST_CASES = [
    # AI模型类（应该include）
    {
        "id": "1",
        "source": "test",
        "domain": "github.com",
        "title": "OpenAI发布GPT-5模型，推理性能提升300%"
    },
    {
        "id": "2",
        "source": "test",
        "domain": "arxiv.org",
        "title": "Transformer架构新突破：Multi-Head Attention优化算法"
    },
    # 开发基础设施类（应该include）
    {
        "id": "3",
        "source": "test",
        "domain": "github.com",
        "title": "Kubernetes 1.30 released with enhanced security features"
    },
    {
        "id": "4",
        "source": "test",
        "domain": "rust-lang.org",
        "title": "Rust 1.75发布：异步生态系统重大改进"
    },
    # 硬件专业类（应该include）
    {
        "id": "5",
        "source": "test",
        "domain": "nvidia.com",
        "title": "NVIDIA H200 GPU架构详解：Transformer Engine优化"
    },
    # 商业融资类（应该exclude）
    {
        "id": "6",
        "source": "test",
        "domain": "techcrunch.com",
        "title": "某AI公司完成B轮融资5亿美元，估值达50亿"
    },
    {
        "id": "7",
        "source": "test",
        "domain": "36kr.com",
        "title": "字节跳动Q4财报：营收增长25%"
    },
    # 消费电子类（应该exclude）
    {
        "id": "8",
        "source": "test",
        "domain": "apple.com",
        "title": "iPhone 16 Pro发布：售价$999起，配备A18芯片"
    },
    {
        "id": "9",
        "source": "test",
        "domain": "xiaomi.com",
        "title": "小米14 Ultra评测：2024年最强拍照手机"
    },
    # 营销类（应该exclude）
    {
        "id": "10",
        "source": "test",
        "domain": "marketing.com",
        "title": "2024年AI行业趋势报告：市场规模将达1万亿美元"
    },
    # 边界案例：技术深度不足
    {
        "id": "11",
        "source": "test",
        "domain": "medium.com",
        "title": "如何使用ChatGPT提高工作效率：10个实用技巧"
    },
    # 边界案例：混合类型（技术+商业）
    {
        "id": "12",
        "source": "test",
        "domain": "techcrunch.com",
        "title": "OpenAI发布企业级API，支持私有部署和模型微调"
    },
]


async def main():
    print("=" * 80)
    print("RSS AI分类系统测试")
    print("=" * 80)
    print()
    
    # 测试分类效果
    print("📋 测试用例分类结果:")
    print("-" * 80)
    
    result = await mb_ai_test_classification(TEST_CASES)
    
    if not result.get("ok"):
        print(f"❌ 测试失败: {result.get('detail') or result.get('error')}")
        return
    
    print(f"✅ 使用模型: {result['model']}")
    print(f"✅ Prompt版本: {result['prompt_version']}")
    print()
    
    # 统计结果
    passed = 0
    failed = 0
    
    for i, (test_case, classification) in enumerate(zip(TEST_CASES, result["results"]), 1):
        pass_filter = classification.get("pass_strict_filter", False)
        action = classification.get("action", "")
        category = classification.get("category", "")
        score = classification.get("score", 0)
        confidence = classification.get("confidence", 0)
        reason = classification.get("reason", "")
        
        # 判断是否符合预期
        title = test_case["title"]
        expected_include = i <= 5  # 前5个应该include
        is_correct = (pass_filter == expected_include)
        
        status = "✅" if is_correct else "⚠️"
        if is_correct:
            passed += 1
        else:
            failed += 1
        
        print(f"{status} 测试 {i}/{len(TEST_CASES)}")
        print(f"   标题: {title}")
        print(f"   分类: {category} | 动作: {action} | 分数: {score} | 置信度: {confidence:.2f}")
        print(f"   通过严格过滤: {'是' if pass_filter else '否'}")
        print(f"   原因: {reason}")
        print()
    
    print("-" * 80)
    print(f"准确率: {passed}/{len(TEST_CASES)} ({passed/len(TEST_CASES)*100:.1f}%)")
    print()
    
    # 显示过滤配置
    filter_config = result.get("filter_config", {})
    print("🔧 过滤配置:")
    print(f"   最低分数: {filter_config.get('min_score', 0)}")
    print(f"   最低置信度: {filter_config.get('min_confidence', 0)}")
    print(f"   允许分类: {', '.join(filter_config.get('allowed_categories', []))}")
    print()
    
    # 获取统计信息
    print("=" * 80)
    print("📊 历史分类统计 (最近24小时)")
    print("-" * 80)
    
    try:
        # 需要设置project_root环境
        from pathlib import Path
        import os
        
        # 尝试获取统计（如果数据库存在）
        project_root = Path(__file__).parent
        online_db = project_root / "output" / "online.db"
        
        if not online_db.exists():
            print("ℹ️  数据库尚未初始化（output/online.db不存在）")
            print("   首次运行RSS爬虫后会自动创建数据库并开始AI分类")
        else:
            from trendradar.web.db_online import get_online_db_conn
            
            # 设置全局变量
            global _project_root
            from trendradar.web import rss_scheduler
            rss_scheduler._project_root = project_root
            
            stats = mb_ai_get_classification_stats(last_n_hours=24)
        
            if "error" in stats:
                print(f"⚠️  {stats['error']}")
            else:
                print(f"总标注数量: {stats.get('total_labeled', 0)}")
                print()
                
                print("按动作分组:")
                for action, count in stats.get("action_stats", {}).items():
                    print(f"  {action}: {count}")
                print()
                
                print("按分类分组:")
                for category, count in stats.get("category_stats", {}).items():
                    print(f"  {category}: {count}")
                print()
                
                include_stats = stats.get("include_stats", {})
                print(f"Include统计:")
                print(f"  平均分数: {include_stats.get('avg_score', 0)}")
                print(f"  平均置信度: {include_stats.get('avg_confidence', 0)}")
                print(f"  分数范围: {include_stats.get('min_score', 0)} - {include_stats.get('max_score', 0)}")
                print()
                
                print(f"通过严格过滤: {stats.get('passed_strict_filter', 0)}")
                print(f"通过率: {stats.get('pass_rate', 0)}%")
                print()
                
                print(f"Prompt版本: {stats.get('prompt_version', 'unknown')}")
    
    except Exception as e:
        print(f"❌ 获取统计信息失败: {str(e)}")
    
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
