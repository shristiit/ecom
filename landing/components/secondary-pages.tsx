import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { landingImages } from './landing-assets';
import { ContactForm } from './contact-form';
import { HeroButton, PageHead, PageScrollFrame, PageSection, SurfaceCard } from './marketing-shell';
import { IconBadge, LandingVisual, TextPill } from './landing-media';
import { faqItems, howItWorksSteps, pricingPlans } from './site-content';

const howItWorksHeroStyle = {
  // @ts-expect-error web-only CSS background
  backgroundImage:
    'radial-gradient(circle at top right, rgba(247, 212, 148, 0.16), transparent 26%), linear-gradient(180deg, #10233a 0%, #173154 58%, #1b395f 100%)',
};

const pricingHeroStyle = {
  // @ts-expect-error web-only CSS background
  backgroundImage:
    'radial-gradient(circle at top right, rgba(247, 212, 148, 0.14), transparent 26%), linear-gradient(180deg, #f8f4ee 0%, #f3ece2 100%)',
};

const mutedWhiteText = { color: 'rgba(255,255,255,0.8)' };

function goTo(path: string) {
  return () => router.push(path as never);
}

function SectionHero({
  title,
  text,
  dark = false,
}: {
  title: string;
  text: string;
  dark?: boolean;
}) {
  return (
    <View className="max-w-[760px] gap-4">
      <Text className={`font-display text-[58px] leading-[58px] tracking-[-1.6px] ${dark ? 'text-white' : 'text-text'}`}>
        {title}
      </Text>
      <Text style={dark ? mutedWhiteText : undefined} className={`text-lg leading-8 ${dark ? '' : 'text-muted'}`}>
        {text}
      </Text>
    </View>
  );
}

export function HowItWorksScreen() {
  return (
    <>
      <PageHead
        title="How StockAisle Works | Conversational Stock Control with Audit Trail"
        description="See how StockAisle turns inventory conversations into controlled actions with checks, confirmations, approvals, and audit trail built in."
        path="/how-it-works"
      />
      <PageScrollFrame>
        <PageSection style={howItWorksHeroStyle} className="pb-14 pt-5">
          <View className="flex-row flex-wrap items-center gap-8">
            <View className="min-w-[320px] flex-1">
              <SectionHero title="How StockAisle works" text="Simple for the user. Controlled behind the scenes." dark />
            </View>
            <View className="min-w-[320px] flex-1">
              <LandingVisual
                source={landingImages.workflowGovernance}
                label="Governance Flow"
                alt="StockAisle workflow and governance preview"
                height={420}
                dark
              />
            </View>
          </View>
        </PageSection>

        <PageSection className="pt-10">
          <View className="flex-row flex-wrap gap-4">
            {howItWorksSteps.map((item, index) => (
              <SurfaceCard key={item.step} className="min-w-[240px] flex-1 gap-3 p-5">
                <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-primary">0{index + 1}</Text>
                <View className="gap-2">
                  <Text className="text-xl font-semibold text-text">{item.title}</Text>
                  <Text className="text-sm leading-6 text-muted">{item.text}</Text>
                </View>
                <Text className="text-xs uppercase tracking-[1.2px] text-muted">{item.step}</Text>
              </SurfaceCard>
            ))}
          </View>
        </PageSection>

        <PageSection className="pt-6">
          <SurfaceCard className="gap-5 bg-surface-2">
            <Text className="font-display text-[42px] leading-[44px] tracking-[-1.1px] text-text">
              Built for everyday work
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {['easy for frontline teams', 'clear for managers', 'traceable for finance and audit'].map((item) => (
                <TextPill key={item} text={item} />
              ))}
            </View>
            <View className="w-fit">
              <HeroButton label="Book a Demo" onPress={goTo('/contact')} />
            </View>
          </SurfaceCard>
        </PageSection>
      </PageScrollFrame>
    </>
  );
}

export function PricingScreen() {
  return (
    <>
      <PageHead
        title="StockAisle Pricing | Conversational Inventory Software for SMEs"
        description="Explore StockAisle pricing for SME wholesalers and inventory-heavy businesses. Choose a simple plan with stock control, approvals, and audit history."
        path="/pricing"
      />
      <PageScrollFrame>
        <PageSection style={pricingHeroStyle} className="pb-10 pt-10">
          <View className="flex-row flex-wrap items-center gap-8">
            <View className="min-w-[320px] flex-1">
              <SectionHero
                title="Pricing that grows with your operations"
                text="Simple plans for teams moving beyond spreadsheets and manual stock updates."
              />
            </View>
            <View className="min-w-[320px] flex-1">
              <LandingVisual
                source={landingImages.opsOverview}
                label="Operations Overview"
                alt="StockAisle pricing and operations preview"
                height={340}
              />
            </View>
          </View>
        </PageSection>

        <PageSection className="pt-4">
          <View className="flex-row flex-wrap gap-4">
            {pricingPlans.map((plan) => (
              <SurfaceCard
                key={plan.name}
                className="min-w-[280px] flex-1 gap-5 p-7"
                style={
                  plan.featured
                    ? { backgroundColor: 'rgb(28, 59, 99)', borderColor: 'rgb(28, 59, 99)' }
                    : undefined
                }
              >
                <View className="gap-2">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className={`text-sm font-semibold uppercase tracking-[1.8px] ${plan.featured ? 'text-white' : 'text-primary'}`}>
                      {plan.name}
                    </Text>
                    {plan.badge ? (
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.14)' }} className="rounded-full px-3 py-1">
                        <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-white">{plan.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className={`font-display text-[40px] leading-[42px] tracking-[-1px] ${plan.featured ? 'text-white' : 'text-text'}`}>
                    {plan.price}
                  </Text>
                  <Text
                    style={plan.featured ? { color: 'rgba(255,255,255,0.8)' } : undefined}
                    className={`text-base ${plan.featured ? 'text-white' : 'text-muted'}`}
                  >
                    Best for: {plan.bestFor}
                  </Text>
                </View>

                <View className="gap-3">
                  {plan.fullPoints.map((point) => (
                    <View key={point} className="flex-row items-center gap-3">
                      <View className={`h-2.5 w-2.5 rounded-full ${plan.featured ? 'bg-white' : 'bg-primary'}`} />
                      <Text className={`text-base ${plan.featured ? 'text-white' : 'text-text'}`}>{point}</Text>
                    </View>
                  ))}
                </View>
              </SurfaceCard>
            ))}
          </View>
        </PageSection>

        <PageSection className="pt-6">
          <SurfaceCard className="gap-5 bg-surface-2">
            <Text className="text-base leading-7 text-muted">
              Optional add-ons can be introduced later as needs grow.
            </Text>
            <View className="w-fit">
              <HeroButton label="Book a Demo" onPress={goTo('/contact')} />
            </View>
          </SurfaceCard>
        </PageSection>
      </PageScrollFrame>
    </>
  );
}

export function FaqScreen() {
  return (
    <>
      <PageHead
        title="StockAisle FAQ | Conversational Inventory and Trade Operations"
        description="Read common questions about StockAisle, including inventory updates through chat, approvals, audit trail, onboarding, and who the platform is built for."
        path="/faq"
      />
      <PageScrollFrame>
        <PageSection className="pb-6 pt-10">
          <SectionHero
            title="Common questions"
            text="Clear answers about inventory updates through chat, controls, onboarding, and audit trail."
          />
        </PageSection>

        <PageSection className="pt-2">
          <View className="gap-4">
            {faqItems.map((item, index) => (
              <SurfaceCard key={item.question} className="flex-row gap-5 p-6">
                <IconBadge label={`0${index + 1}`} />
                <View className="flex-1 gap-2">
                  <Text className="text-xl font-semibold text-text">{item.question}</Text>
                  <Text className="text-base leading-7 text-muted">{item.answer}</Text>
                </View>
              </SurfaceCard>
            ))}
          </View>
        </PageSection>

        <PageSection className="pt-6">
          <View className="w-fit">
            <HeroButton label="Book a Demo" onPress={goTo('/contact')} />
          </View>
        </PageSection>
      </PageScrollFrame>
    </>
  );
}

export function ContactScreen() {
  return (
    <>
      <PageHead
        title="Book a StockAisle Demo | Conversational Inventory Management"
        description="Book a StockAisle demo and see how your team can manage stock, orders, and operations through simple conversation with audit trail and approval flow."
        path="/contact"
      />
      <PageScrollFrame>
        <PageSection className="pb-6 pt-10">
          <View className="flex-row flex-wrap items-start gap-8">
            <View className="min-w-[300px] flex-1 gap-4">
              <SectionHero
                title="Book a demo"
                text="See how StockAisle can help your team manage stock and daily operations with less admin and more control."
              />
              <Text className="max-w-[520px] text-base leading-7 text-muted">
                Tell us a little about your business and we will get back to you shortly.
              </Text>
              <View className="flex-row flex-wrap gap-3">
                {['Built for inventory-heavy SME teams', 'Clear control', 'Less admin'].map((item) => (
                  <TextPill key={item} text={item} />
                ))}
              </View>
            </View>

            <View className="min-w-[320px] flex-1">
              <ContactForm
                title="Request a demo"
                intro="Tell us a little about your business and we will get back to you shortly."
              />
            </View>
          </View>
        </PageSection>

        <PageSection className="pt-2">
          <SurfaceCard className="gap-3 bg-surface-2">
            <Text className="text-base leading-7 text-muted">
              Built for inventory-heavy SME teams that want clear control without heavy systems.
            </Text>
          </SurfaceCard>
        </PageSection>
      </PageScrollFrame>
    </>
  );
}

export function CareersScreen() {
  return (
    <>
      <PageHead title="Careers at StockAisle" description="Careers at StockAisle." path="/careers" />
      <PageScrollFrame>
        <PageSection className="pb-6 pt-10">
          <SectionHero
            title="Careers at StockAisle"
            text="Built for real operations. Built for serious teams."
          />
        </PageSection>

        <PageSection className="pt-2">
          <View className="flex-row flex-wrap gap-6">
            <SurfaceCard className="min-w-[320px] flex-1 gap-4">
              <Text className="font-display text-[38px] leading-[42px] tracking-[-0.9px] text-text">
                No open roles currently. Check back later.
              </Text>
              <Text className="text-base leading-7 text-muted">
                When roles open, this page will be updated with position details and application instructions.
              </Text>
            </SurfaceCard>

            <SurfaceCard className="min-w-[280px] w-[360px] gap-4 bg-surface-2">
              <Text className="text-2xl font-semibold text-text">Built for disciplined operators</Text>
              <Text className="text-base leading-7 text-muted">
                StockAisle is focused on clear control, trusted records, and easier daily operations.
              </Text>
            </SurfaceCard>
          </View>
        </PageSection>
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
        <PageSection className="pb-6 pt-10">
          <SectionHero title={title} text={description} />
        </PageSection>

        <PageSection className="pt-2">
          <View className="flex-row flex-wrap gap-5">
            {sections.map((section) => (
              <SurfaceCard key={section.title} className="min-w-[320px] flex-1 gap-3">
                <Text className="text-2xl font-semibold text-text">{section.title}</Text>
                {section.body.map((paragraph) => (
                  <Text key={paragraph} className="text-base leading-7 text-muted">
                    {paragraph}
                  </Text>
                ))}
              </SurfaceCard>
            ))}
          </View>
        </PageSection>
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
            'We may collect your name, company name, email address, phone number, and any message you send when requesting a demo or contacting us.',
            'We may also collect technical information needed to operate the site securely and reliably.',
          ],
        },
        {
          title: 'How we use it',
          body: [
            'We use this information to respond to demo requests and general enquiries, assess platform fit, and keep records of business interactions.',
            'We may also use limited technical data to improve site security, reliability, and operational performance.',
          ],
        },
        {
          title: 'Sharing and retention',
          body: [
            'We do not sell personal information collected through this site. Data may be shared with service providers involved in hosting or form handling when needed to operate the site or respond to your request.',
            'Personal information is retained only for as long as necessary to manage the enquiry, maintain business records, or meet legal obligations.',
          ],
        },
        {
          title: 'Contact',
          body: [
            'If you have privacy questions or would like to exercise a data request, contact support@stockaisle.com.',
            'StockAisle Ltd, Newcastle upon Tyne, United Kingdom.',
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
            'Essential technologies remain active because the site depends on them to function properly.',
          ],
        },
        {
          title: 'Essential and security',
          body: ['Essential technologies support basic site functionality and traffic integrity.'],
        },
        {
          title: 'Optional categories',
          body: [
            'The site can support optional analytics and marketing technologies in the future, but those categories should only run if you actively consent in a production implementation.',
          ],
        },
        {
          title: 'Contact',
          body: [
            'If you have questions about cookies or browser-based storage on this site, contact support@stockaisle.com.',
            'StockAisle Ltd, Newcastle upon Tyne, United Kingdom.',
          ],
        },
      ]}
    />
  );
}
