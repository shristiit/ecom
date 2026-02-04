import { Builder, By, until, WebDriver } from "selenium-webdriver";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

describe("Home page", function () {
  this.timeout(30000);

  let driver: WebDriver;

  before(async () => {
    driver = await new Builder().forBrowser("chrome").build();
  });

  after(async () => {
    if (driver) {
      await driver.quit();
    }
  });

  it("shows the landing page title", async () => {
    await driver.get(BASE_URL);
    await driver.wait(until.titleIs("Your App Title"), 10000);
  });

  it("renders a key element", async () => {
    await driver.get(BASE_URL);
    const el = await driver.wait(
      until.elementLocated(By.css("[data-testid='hero-cta']")),
      10000
    );
    const text = await el.getText();
    if (!text.includes("Shop")) {
      throw new Error("CTA text missing expected copy");
    }
  });
});
