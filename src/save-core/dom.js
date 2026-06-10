/**
 * Browser DOM helpers used before extracting Zhihu rich text.
 */

export async function expandCollapsedContent(scope = document) {
  const labels = ["阅读全文", "展开阅读全文", "继续阅读", "显示全部", "展开全部"];
  const candidates = Array.from(scope.querySelectorAll("button, a"));

  for (const el of candidates) {
    const text = (el.textContent || "").replace(/\s+/g, "");
    if (labels.some((label) => text.includes(label))) {
      el.click();
    }
  }

  await delay(600);
}

export function hasRiskOrChallengePage() {
  const text = `${document.title || ""}\n${document.body?.innerText || ""}`;
  return /请求存在异常|暂时限制|验证码|安全验证|账号安全|40362/.test(text);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
