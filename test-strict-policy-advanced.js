// 厳格セキュリティポリシーの詳細テスト

// 営業時間内の時刻を生成（平日9-18時）
function getBusinessHour() {
  const date = new Date();
  date.setHours(10); // 10時に設定
  // 平日（月曜日）に設定
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

const advancedTestCases = [
  {
    name: "営業時間内・適切なクリアランスでの読み取り",
    request: {
      agent: "internal-support-agent",
      action: "read",
      resource: "/workspace/data/customer-list.csv",
      purpose: "customer-support",
      time: getBusinessHour(),
      environment: {
        agentType: "internal",
        