# Openclaw 接口使用指南

## 输入格式

推荐把 Openclaw 采集到的租房文本整理为“一行一条”的形式，再提交给系统：

```text
国定路财大小区，二室一厅，双南，精装修，6500元约看房，4月20号空
国年路25弄，双南两房，5300可谈。
三门路 婚房装修 电梯二房二厅 挂牌7800可谈有钥匙 含地下车位
美岸栖庭二房出租7300一个月。
```

也可以使用 JSON：

```json
{
  "items": [
    {
      "rawText": "国年路25弄，双南两房，5300可谈。",
      "source": "openclaw",
      "externalId": "openclaw-001",
      "capturedAt": "2026-03-29T08:00:00.000Z",
      "reporter": "crawler-a"
    }
  ]
}
```

## API

### 1. 批量写入

`POST /api/rentals/ingest`

支持两种请求体：

- `{"lines": ["文本1", "文本2"]}`
- `{"items": [{...RentalIngestInput}]}`

返回：

- `processed / inserted / merged / invalid`
- `communitySync.created / updated / skipped / geocoded`
- 最新 `snapshot`
- 最新 `report`
- 如果输入里带有新小区，系统会尝试调用高德 API 自动补坐标并写入地图数据源

### 2. 获取报告

`GET /api/rentals/report`

返回当前快照与最近报告。

### 3. 强制生成报告

`POST /api/rentals/report`

用于定时任务、发布前巡检或人工刷新。

### 4. 恢复最近备份

`POST /api/rentals/restore`

用于误写回滚。

### 5. 提交反馈

`POST /api/rentals/feedback`

请求体示例：

```json
{
  "rating": 4,
  "message": "国定路样本的户型识别正确，但面积未识别",
  "communityId": "国定路财大小区",
  "contact": "wechat:demo"
}
```

## 错误处理

- 空输入：返回 400
- JSON 结构不合法：返回 500，并附带错误信息
- 无可恢复备份：`/api/rentals/restore` 返回 404
- 新小区地理编码失败：接口仍返回 200，但 `communitySync.skipped > 0`

## 最佳实践

- 采集端尽量保留原始句式，不要提前做过度裁剪
- 每条文本最好只描述一套房源
- 同一轮采集建议带上统一 `capturedAt`
- 如果采集器已生成唯一 ID，请透传 `externalId`
- 每日或每小时触发一次 `POST /api/rentals/report`
- 发布前运行 `npm run release:rentals`
