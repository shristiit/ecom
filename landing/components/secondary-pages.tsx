import { Text, View } from 'react-native';

import { PageHead, PageScrollFrame, SurfaceCard } from './marketing-shell';

const faqItems = [
  {
    question: 'What is StockAisle?',
    answer:
      'StockAisle is a conversational, governed inventory and trade operations platform built for inventory-heavy businesses and SME wholesalers.',
  },
  {
    question: 'Who is it for?',
    answer:
      'It is designed for SME wholesalers, inventory-heavy businesses, and multi-location teams moving away from spreadsheet-led operations.',
  },
  {
    question: 'How does it help inventory operations?',
    answer:
      'It provides better stock visibility, structured workflows, reduced admin effort, and stronger auditability across day-to-day operational tasks.',
  },
  {
    question: 'Do you support integrations?',
    answer:
      'StockAisle is built with an integration-ready architecture designed to work alongside existing systems such as Excel, commerce platforms, finance tools, POS, and ERP environments.',
  },
  {
    question: 'How does onboarding work?',
    answer:
      'Onboarding is guided around your operating model, data structure, locations, and approval requirements so the platform reflects how your team actually works.',
  },
  {
    question: 'Can I see a demo?',
    answer: 'Yes. Use the contact form on the homepage and the team will arrange a guided walkthrough of the platform.',
  },
  {
    question: 'Is it suitable for multi-location businesses?',
    answer:
      'Yes. StockAisle is designed to support businesses operating across multiple sites, warehouses, or branch environments.',
  },
  {
    question: 'How secure is the platform?',
    answer:
      'Security is supported through role-based access, governed workflows, audit-ready records, and structured operational controls.',
  },
] as const;

export function CareersScreen() {
  return (
    <>
      <PageHead title="Careers at StockAisle" description="Careers at StockAisle." path="/careers" />
      <PageScrollFrame>
        <View className="px-4 pb-4 pt-10">
          <View className="mx-auto w-full max-w-[1180px] gap-6">
            <View className="max-w-[820px] gap-4">
              <Text className="font-display text-[52px] leading-[56px] tracking-[-1.2px] text-text">
                Careers at StockAisle
              </Text>
              <Text className="text-base leading-7 text-muted">
                StockAisle is focused on building a serious operational platform for wholesalers and inventory-heavy
                businesses.
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-6">
              <SurfaceCard className="min-w-[320px] flex-1">
                <Text className="font-display text-[38px] leading-[42px] tracking-[-0.9px] text-text">
                  No open roles currently. Check back later.
                </Text>
                <Text className="mt-4 text-base leading-7 text-muted">
                  When roles open, this page will be updated with position details, responsibilities, and application
                  instructions.
                </Text>
              </SurfaceCard>

              <SurfaceCard className="min-w-[280px] w-[360px]">
                <Text className="text-2xl font-semibold text-text">Built for disciplined operators</Text>
                <Text className="mt-4 text-base leading-7 text-muted">
                  StockAisle is aimed at teams that need operational control, traceability, and governed workflows
                  rather than another surface layered on top of spreadsheet drift.
                </Text>
              </SurfaceCard>
            </View>
          </View>
        </View>
      </PageScrollFrame>
    </>
  );
}

export function FaqScreen() {
  return (
    <>
      <PageHead
        title="FAQ | StockAisle"
        description="Frequently asked questions about StockAisle, governed inventory workflows, onboarding, integrations, and operational control."
        path="/faq"
      />
      <PageScrollFrame stickyHeader={false}>
        <View className="px-4 pb-4 pt-10">
          <View className="mx-auto w-full max-w-[1180px] gap-8">
            <View className="max-w-[820px] gap-4">
              <Text className="font-display text-[52px] leading-[56px] tracking-[-1.2px] text-text">
                Questions teams ask before moving to a more governed operating model
              </Text>
              <Text className="text-base leading-7 text-muted">
                This page covers the most common questions about StockAisle, onboarding, integrations, security, and
                fit for inventory-heavy operations.
              </Text>
            </View>

            <View className="gap-4">
              {faqItems.map((item) => (
                <SurfaceCard key={item.question} className="gap-3">
                  <Text className="text-2xl font-semibold leading-8 text-text">{item.question}</Text>
                  <Text className="text-base leading-7 text-muted">{item.answer}</Text>
                </SurfaceCard>
              ))}
            </View>
          </View>
        </View>
      </PageScrollFrame>
    </>
  );
}

function LegalPage({
  title,
  description,
  path,
  sections,
}: {
  title: string;
  description: string;
  path: string;
  sections: Array<{ title: string; body: string[] }>;
}) {
  return (
    <>
      <PageHead title={`${title} | StockAisle`} description={description} path={path} />
      <PageScrollFrame>
        <View className="px-4 pb-4 pt-10">
          <View className="mx-auto w-full max-w-[1180px] gap-8">
            <View className="max-w-[820px] gap-4">
              <Text className="font-display text-[52px] leading-[56px] tracking-[-1.2px] text-text">{title}</Text>
              <Text className="text-base leading-7 text-muted">{description}</Text>
            </View>

            <View className="flex-row flex-wrap gap-5">
              {sections.map((section) => (
                <SurfaceCard key={section.title} className="min-w-[320px] flex-1">
                  <Text className="text-2xl font-semibold text-text">{section.title}</Text>
                  {section.body.map((paragraph) => (
                    <Text key={paragraph} className="mt-4 text-base leading-7 text-muted">
                      {paragraph}
                    </Text>
                  ))}
                </SurfaceCard>
              ))}
            </View>
          </View>
        </View>
      </PageScrollFrame>
    </>
  );
}

export function PrivacyPolicyScreen() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="This page explains how StockAisle handles personal information collected through the marketing website, contact forms, and direct communication channels."
      path="/privacy-policy"
      sections={[
        {
          title: 'Information we collect',
          body: [
            'We may collect contact details such as your name, company name, email address, phone number, role, country, and any details you provide when requesting a demo or contacting us.',
            'We may also collect technical information needed to operate the site securely, including anti-spam or security signals.',
          ],
        },
        {
          title: 'How we use it',
          body: [
            'We use this information to respond to demo requests and general enquiries, assess platform fit, and keep records of legitimate business interactions.',
            'We may also use limited technical data to improve site security, reliability, and operational performance.',
          ],
        },
        {
          title: 'Sharing and retention',
          body: [
            'We do not sell personal information collected through this site. Data may be shared with service providers involved in hosting, spam protection, or form handling when needed to operate the site or respond to your request.',
            'Personal information is retained only for as long as necessary to manage the relevant enquiry, maintain business records, or meet legal and operational obligations.',
          ],
        },
        {
          title: 'Contact',
          body: [
            'If you have privacy questions or would like to exercise a data request, contact support@stockaisle.com.',
            'Stockailse ltd, Newcastle upon Tyne, United Kingdom.',
          ],
        },
      ]}
    />
  );
}

export function CookiePolicyScreen() {
  return (
    <LegalPage
      title="Cookie Policy"
      description="This page explains how StockAisle uses essential technologies and how optional analytics or marketing cookies are handled on the website."
      path="/cookie-policy"
      sections={[
        {
          title: 'How cookies are used',
          body: [
            'Cookies and similar browser storage technologies can support navigation, help secure forms, and optionally measure how the site is used.',
            'StockAisle blocks non-essential categories until you choose to allow them in future implementations. Essential security-related mechanisms remain active because the site depends on them to function properly.',
          ],
        },
        {
          title: 'Essential and security',
          body: [
            'Essential technologies support basic site functionality, traffic integrity, and anti-spam controls such as Google reCAPTCHA where configured.',
          ],
        },
        {
          title: 'Optional categories',
          body: [
            'The site is prepared to support optional analytics and marketing technologies in the future, but those categories should only run if you actively consent in a production implementation.',
          ],
        },
        {
          title: 'Contact',
          body: [
            'If you have questions about cookies or browser-based storage on this site, contact support@stockaisle.com.',
            'Stockailse ltd, Newcastle upon Tyne, United Kingdom.',
          ],
        },
      ]}
    />
  );
}
