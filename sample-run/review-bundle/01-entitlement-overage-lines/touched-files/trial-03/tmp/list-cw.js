const { CloudWatchClient, ListMetricsCommand, GetMetricDataCommand, GetMetricStatisticsCommand } = require("@aws-sdk/client-cloudwatch");

async function main() {
  const client = new CloudWatchClient({});
  try {
    const listed = await client.send(new ListMetricsCommand({}));
    console.log("LIST METRICS:", JSON.stringify(listed, null, 2).slice(0, 20000));
  } catch (e) {
    console.log("LIST ERR", e.name, e.message);
  }

  try {
    const listed2 = await client.send(new ListMetricsCommand({ Namespace: "MeteringCo/Usage" }));
    console.log("LIST NS:", JSON.stringify(listed2, null, 2).slice(0, 20000));
  } catch (e) {
    console.log("LIST NS ERR", e.name, e.message);
  }
}
main();
