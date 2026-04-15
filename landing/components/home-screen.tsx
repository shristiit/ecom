import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { landingImages } from './landing-assets';
import { HeroButton, PageHead, PageScrollFrame, PageSection, SurfaceCard } from './marketing-shell';
import { IconBadge, LandingBackdrop, LandingVisual, TextPill, TrustLogo } from './landing-media';
import { pricingPlans } from './site-content';

const heroSectionStyle = {
  backgroundColor: '#10233a',
};

const workflowSectionStyle = {
  // @ts-expect-error web-only CSS background
  backgroundImage:
    'radial-gradient(circle at bottom left, rgba(247, 212, 148, 0.15), transparent 28%), linear-gradient(160deg, #112137 0%, #173154 50%, #1f426d 100%)',
};

const finalCtaStyle = {
  // @ts-expect-error web-only CSS background
  backgroundImage:
    'linear-gradient(135deg, rgba(16, 35, 58, 0.95) 0%, rgba(27, 57, 95, 0.92) 100%)',
};

const problemItems = [
  {
    title: 'Late stock updates',
    text: 'Real changes happen first. The system gets updated later.',
  },
  {
    title: 'Spreadsheet dependence',
    text: 'Teams still rely on sheets, notes, and one “system person”.',
  },
  {
    title: 'Low trust in reports',
    text: 'If records drift, people stop trusting the numbers.',
  },
  {
    title: 'Too much firefighting',
    text: 'Managers spend time chasing updates instead of running operations.',
  },
] as const;

const channelItems = [
  'Website chat',
  'App chat',
  'WhatsApp-style messaging',
  'Mobile message flows',
] as const;

const solutionItems = [
  'Ask what is low',
  'Record what changed',
  'Keep every action traceable',
] as const;

const useCaseItems = [
  {
    title: 'Check stock',
    text: 'Ask what is low, what moved, and what changed.',
  },
  {
    title: 'Record receiving',
    text: 'Capture deliveries as they happen.',
  },
  {
    title: 'Write off damage',
    text: 'Log wastage and stock loss with confirmation.',
  },
  {
    title: 'Move stock',
    text: 'Record transfers across locations.',
  },
  {
    title: 'Create purchase actions',
    text: 'Start purchase workflows faster.',
  },
  {
    title: 'Support sales actions',
    text: 'Handle sales and invoicing flows with less admin.',
  },
] as const;

const governanceCards = [
  'Role-based access',
  'Approval rules',
  'Confirmation before changes',
  'Audit trail for every action',
] as const;

const benefitItems = [
  {
    title: 'Less admin',
    text: 'Fewer clicks and less chasing.',
  },
  {
    title: 'Faster updates',
    text: 'Record events when they happen.',
  },
  {
    title: 'Better control',
    text: 'Set rules around who can do what.',
  },
  {
    title: 'Clear accountability',
    text: 'See who changed what and when.',
  },
  {
    title: 'Stronger decisions',
    text: 'Work from cleaner, more trusted data.',
  },
  {
    title: 'Easier adoption',
    text: 'Built for teams that do not want complex systems.',
  },
] as const;

const integrationItems = [
  'Ecommerce systems',
  'Accounting exports',
  'POS / ERP connections',
] as const;

const trustMarks = ['Stock updates', 'Purchase workflows', 'Sales workflows', 'Audit-ready history'] as const;

const mutedWhiteText = { color: 'rgba(255,255,255,0.8)' };
const subtleWhiteText = { color: 'rgba(255,255,255,0.62)' };

function goTo(path: string) {
  return () => router.push(path as never);
}

export function HomeScreen() {
  return (
    <>
      <PageHead
        title="StockAisle | Conversational Inventory Management Software for Wholesalers"
        description="StockAisle helps wholesalers and inventory-heavy businesses manage stock, orders, and daily operations through simple conversation with confirmations, approvals, and audit trail built in."
        path="/"
      />

      <PageScrollFrame>
        <PageSection style={heroSectionStyle} className="pb-14 pt-5">
          <View className="relative overflow-hidden rounded-[36px] px-8 py-6">
            <LandingBackdrop
              source={landingImages.finalCtaBg}
              label="CTA Visual"
              alt="StockAisle hero background visual"
            />
            <View className="relative flex-row flex-wrap items-center gap-8">
              <View className="min-w-[320px] flex-1 gap-7 py-8">
                <View className="gap-4">
                  <Text className="max-w-[700px] font-display text-[64px] leading-[64px] tracking-[-1.8px] text-white">
                    Run stock and operations through simple conversation
                  </Text>
                  <Text style={mutedWhiteText} className="max-w-[560px] text-lg leading-8">
                    Ask questions, record stock updates, manage orders, and handle daily work through chat, with clear
                    control built in.
                  </Text>
                </View>

                <View className="flex-row flex-wrap gap-4">
                  <HeroButton label="Book a Demo" onPress={goTo('/contact')} />
                  <HeroButton label="See How It Works" variant="secondary" onPress={goTo('/how-it-works')} />
                </View>

                <View className="flex-row flex-wrap gap-3">
                  {['Ask instead of searching screens', 'Update stock through chat', 'Keep clear audit history'].map((item) => (
                    <TextPill key={item} text={item} dark />
                  ))}
                </View>
              </View>

              <View className="min-w-[320px] flex-1">
              <LandingVisual
                source={landingImages.heroDashboard}
                label="Product Preview"
                alt="StockAisle product dashboard preview"
                aspectRatio={1.5}
                dark
                contentFit="cover"
              />
            </View>
            </View>
          </View>
        </PageSection>

        <PageSection className="pt-8">
          <SurfaceCard className="gap-5 py-6">
            <Text className="text-center text-sm font-semibold uppercase tracking-[2px] text-muted">
              Built for real inventory teams
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {trustMarks.map((mark) => (
                <TrustLogo key={mark} label={mark} />
              ))}
            </View>
          </SurfaceCard>
        </PageSection>

        <PageSection className="pt-6">
          <View className="gap-8">
            <View className="max-w-[700px] gap-3">
              <Text className="font-display text-[48px] leading-[50px] tracking-[-1.2px] text-text">
                Inventory gets messy when work happens in messages but records live in forms
              </Text>
              <Text className="max-w-[620px] text-lg leading-8 text-muted">
                Teams notice stock issues in real time, but updates happen late. That creates drift, admin, and
                confusion.
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-4">
              {problemItems.map((item, index) => (
                <SurfaceCard key={item.title} className="min-w-[240px] flex-1 gap-4 p-6">
                  <IconBadge label={`0${index + 1}`} />
                  <View className="gap-2">
                    <Text className="text-xl font-semibold text-text">{item.title}</Text>
                    <Text className="text-base leading-7 text-muted">{item.text}</Text>
                  </View>
                </SurfaceCard>
              ))}
            </View>
          </View>
        </PageSection>

        <PageSection className="pt-2">
          <SurfaceCard className="gap-8 bg-surface-2">
            <View className="flex-row flex-wrap items-center gap-8">
              <View className="min-w-[300px] flex-1 gap-4">
                <Text className="font-display text-[44px] leading-[46px] tracking-[-1.1px] text-text">
                  Work through the channels your team already uses
                </Text>
                <Text className="max-w-[560px] text-lg leading-8 text-muted">
                  StockAisle is built for real business conversations across web chat, app chat, messaging-style
                  flows, and customer-facing channels.
                </Text>
                <View className="flex-row flex-wrap gap-3">
                  {channelItems.map((item) => (
                    <TextPill key={item} text={item} />
                  ))}
                </View>
              </View>

              <View className="min-w-[320px] flex-1">
                <LandingVisual
                  source={landingImages.conversationChannels}
                  label="Multi-Channel Conversation"
                  alt="StockAisle multi-channel conversation preview"
                  height={360}
                />
              </View>
            </View>
          </SurfaceCard>
        </PageSection>

        <PageSection className="pt-6">
          <View className="flex-row flex-wrap items-center gap-8">
            <View className="min-w-[300px] flex-1 gap-5">
              <Text className="font-display text-[44px] leading-[46px] tracking-[-1.1px] text-text">
                One place for questions, updates, and action
              </Text>
              <Text className="max-w-[520px] text-lg leading-8 text-muted">
                StockAisle turns everyday inventory and trade conversations into structured actions.
              </Text>
              <View className="gap-3">
                {solutionItems.map((item) => (
                  <View key={item} className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-4">
                    <IconBadge label={item.slice(0, 1)} />
                    <Text className="flex-1 text-base font-medium text-text">{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="min-w-[320px] flex-1">
              <LandingVisual
                source={landingImages.opsOverview}
                label="Operations Overview"
                alt="StockAisle operations overview visual"
                height={420}
              />
            </View>
          </View>
        </PageSection>

        <PageSection className="pt-8">
          <View className="gap-8">
            <View className="max-w-[620px] gap-3">
              <Text className="font-display text-[44px] leading-[46px] tracking-[-1.1px] text-text">
                What teams can do with StockAisle
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-4">
              {useCaseItems.map((item) => (
                <SurfaceCard key={item.title} className="min-w-[260px] flex-1 gap-4 p-6">
                  <IconBadge label={item.title.slice(0, 1)} />
                  <View className="gap-2">
                    <Text className="text-xl font-semibold text-text">{item.title}</Text>
                    <Text className="text-base leading-7 text-muted">{item.text}</Text>
                  </View>
                </SurfaceCard>
              ))}
            </View>
          </View>
        </PageSection>

        <PageSection style={workflowSectionStyle} className="mt-2">
          <View className="gap-8">
            <View className="flex-row flex-wrap items-end justify-between gap-6">
              <View className="max-w-[640px] gap-3">
                <Text className="font-display text-[46px] leading-[48px] tracking-[-1.2px] text-white">
                  Conversation with control
                </Text>
                <Text style={mutedWhiteText} className="text-lg leading-8">
                  StockAisle does not just listen. It checks, confirms, and records every important action.
                </Text>
              </View>
              <HeroButton label="Book a Demo" onPress={goTo('/contact')} />
            </View>

            <View className="flex-row flex-wrap gap-4">
              {['Ask', 'Check', 'Confirm', 'Update', 'Record'].map((step, index, list) => (
                <View
                  key={step}
                  style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }}
                  className="min-w-[160px] flex-1 gap-3 rounded-[24px] border px-5 py-5"
                >
                  <IconBadge label={step.slice(0, 1)} dark />
                  <Text className="text-base font-semibold text-white">{step}</Text>
                  <Text style={subtleWhiteText} className="text-sm">
                    {index < list.length - 1 ? 'Next step' : 'Clear finish'}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={mutedWhiteText} className="text-base">
              Simple for staff. Controlled for managers.
            </Text>

            <View className="flex-row flex-wrap gap-4">
              <View className="min-w-[320px] flex-1">
                <LandingVisual
                  source={landingImages.workflowGovernance}
                  label="Governance Flow"
                  alt="StockAisle workflow governance visual"
                  height={360}
                  dark
                />
              </View>

              <View className="min-w-[280px] flex-1 gap-4">
                {governanceCards.map((item) => (
                  <SurfaceCard
                    key={item}
                    className="gap-3 p-5"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.12)' }}
                  >
                    <IconBadge label={item.slice(0, 1)} dark />
                    <Text className="text-lg font-semibold text-white">{item}</Text>
                  </SurfaceCard>
                ))}
              </View>
            </View>
          </View>
        </PageSection>

        <PageSection className="pt-10">
          <View className="gap-8">
            <View className="max-w-[620px] gap-3">
              <Text className="font-display text-[44px] leading-[46px] tracking-[-1.1px] text-text">
                Why teams choose StockAisle
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-4">
              {benefitItems.map((item) => (
                <SurfaceCard key={item.title} className="min-w-[240px] flex-1 gap-4 p-6">
                  <IconBadge label={item.title.slice(0, 1)} />
                  <View className="gap-2">
                    <Text className="text-xl font-semibold text-text">{item.title}</Text>
                    <Text className="text-base leading-7 text-muted">{item.text}</Text>
                  </View>
                </SurfaceCard>
              ))}
            </View>
          </View>
        </PageSection>

        <PageSection className="pt-4">
          <SurfaceCard className="gap-8 bg-surface-2">
            <View className="flex-row flex-wrap items-center gap-8">
              <View className="min-w-[280px] flex-1 gap-4">
                <Text className="font-display text-[42px] leading-[44px] tracking-[-1.1px] text-text">
                  Fits into how businesses work today
                </Text>
                <Text className="text-lg leading-8 text-muted">
                  Start simply. Grow into deeper workflows over time.
                </Text>
                <View className="gap-3">
                  {integrationItems.map((item) => (
                    <View key={item} className="flex-row items-center gap-3">
                      <View className="h-2.5 w-2.5 rounded-full bg-primary" />
                      <Text className="text-base text-text">{item}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View className="min-w-[320px] flex-1">
                <LandingVisual
                  source={landingImages.integrationsStrip}
                  label="Integrations Preview"
                  alt="StockAisle integrations preview"
                  height={280}
                />
              </View>
            </View>
          </SurfaceCard>
        </PageSection>

        <PageSection className="pt-8">
          <View className="gap-8">
            <View className="max-w-[620px] gap-3">
              <Text className="font-display text-[44px] leading-[46px] tracking-[-1.1px] text-text">
                Simple plans for growing operations
              </Text>
              <Text className="text-lg leading-8 text-muted">
                Choose the level of control that fits your business.
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-4">
              {pricingPlans.map((plan) => (
                <SurfaceCard
                  key={plan.name}
                  className="min-w-[260px] flex-1 gap-5 p-7"
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
                  </View>

                  <View className="gap-3">
                    {plan.previewPoints.map((point) => (
                      <View key={point} className="flex-row items-center gap-3">
                        <View className={`h-2.5 w-2.5 rounded-full ${plan.featured ? 'bg-white' : 'bg-primary'}`} />
                        <Text className={`text-base ${plan.featured ? 'text-white' : 'text-text'}`}>{point}</Text>
                      </View>
                    ))}
                  </View>
                </SurfaceCard>
              ))}
            </View>

            <View className="w-fit">
              <HeroButton label="See Full Pricing" onPress={goTo('/pricing')} />
            </View>
          </View>
        </PageSection>

        <PageSection className="pb-16 pt-8">
          <View style={finalCtaStyle} className="relative overflow-hidden rounded-[32px] px-8 py-10">
            <LandingBackdrop
              source={landingImages.finalCtaBg}
              label="CTA Visual"
              alt="StockAisle final call to action visual"
            />
            <View className="relative gap-6">
              <View className="max-w-[660px] gap-3">
                <Text className="font-display text-[48px] leading-[50px] tracking-[-1.3px] text-white">
                  See how stock control feels when it is simple
                </Text>
                <Text style={mutedWhiteText} className="text-lg leading-8">
                  Book a demo to see how StockAisle can help your team ask, update, and act with more control.
                </Text>
              </View>
              <View className="w-fit">
                <HeroButton label="Book a Demo" onPress={goTo('/contact')} />
              </View>
            </View>
          </View>
        </PageSection>
      </PageScrollFrame>
    </>
  );
}
