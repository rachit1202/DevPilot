import { prisma } from '../../db/prisma';
import { ActivityService } from '../activity/activity.service';
import { UpdateBrandInput, UpdateApplicationSettingsInput } from '@devpilot/validation';
import { UserRole } from '@prisma/client';
import { AuthUser } from '../../types/fastify';
import { config } from '../../config/env';

export class SettingsService {
  /**
   * Retrieves current BrandSettings.
   * Concurrency-safe singleton retrieval and initialization using upsert on isSingleton.
   */
  static async getBrandSettings() {
    return prisma.brandSettings.upsert({
      where: { isSingleton: true },
      update: {},
      create: {
        isSingleton: true,
        brandName: 'CodeCulture',
        tagline: 'Code. Create. Build. Repeat.',
        websiteUrl: 'https://codeculture.dev',
        primaryColor: '#8B5CF6',
        secondaryColor: '#06B6D4',
        tone: 'Modern, developer-friendly, humorous but informative, creative',
        audience: 'Web developers, students, freelancers, AI enthusiasts, tech founders',
        industry: 'Developer Education & Tech Media',
        primaryLanguage: 'en',
        topics: [
          'Coding Memes',
          'Developer Life',
          'AI & Vibe Coding',
          'Web Development Tips',
          'Programming Tutorials',
          'Tech News & Trends',
          'Tools & Resources',
        ],
        avoidTopics: ['Partisan politics', 'Unverified rumors', 'Hate speech'],
        ctaDefaults: 'Follow @CodeCulture for daily web dev insights, vibe coding tips, and tech humor.',
      },
    });
  }

  /**
   * Updates BrandSettings.
   * Enforces OWNER/ADMIN permission, validates inputs, logs changes only on real modifications.
   */
  static async updateBrandSettings(input: UpdateBrandInput, user: AuthUser) {
    if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
      throw new Error('FORBIDDEN: Only Owners and Admins have permission to modify brand settings.');
    }

    const currentBrand = await this.getBrandSettings();

    // Determine which fields actually changed
    const changedFields: string[] = [];
    const fieldsToCheck: (keyof UpdateBrandInput)[] = [
      'brandName',
      'tagline',
      'description',
      'websiteUrl',
      'logoUrl',
      'primaryColor',
      'secondaryColor',
      'tone',
      'audience',
      'industry',
      'primaryLanguage',
      'guidelines',
      'topics',
      'avoidTopics',
      'ctaDefaults',
    ];

    for (const field of fieldsToCheck) {
      if (input[field] !== undefined) {
        const newVal = input[field];
        const oldVal = (currentBrand as Record<string, unknown>)[field];
        if (Array.isArray(newVal) && Array.isArray(oldVal)) {
          if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
            changedFields.push(field);
          }
        } else {
          const normNew = newVal === null || newVal === undefined ? null : newVal;
          const normOld = oldVal === null || oldVal === undefined ? null : oldVal;
          if (normNew !== normOld) {
            changedFields.push(field);
          }
        }
      }
    }

    const updated = await prisma.brandSettings.update({
      where: { id: currentBrand.id },
      data: {
        brandName: input.brandName,
        tagline: input.tagline,
        description: input.description,
        websiteUrl: input.websiteUrl,
        logoUrl: input.logoUrl,
        primaryColor: input.primaryColor,
        secondaryColor: input.secondaryColor,
        tone: input.tone,
        audience: input.audience,
        industry: input.industry,
        primaryLanguage: input.primaryLanguage,
        guidelines: input.guidelines,
        topics: input.topics,
        avoidTopics: input.avoidTopics,
        ctaDefaults: input.ctaDefaults,
      },
    });

    // Only create an activity log if real changes occurred
    if (changedFields.length > 0) {
      await ActivityService.log({
        userId: user.id,
        action: 'BRAND_SETTINGS_UPDATED',
        entityType: 'BRAND_SETTINGS',
        entityId: updated.id,
        metadata: {
          updatedFields: changedFields,
          brandName: updated.brandName,
        },
      });
    }

    return updated;
  }

  /**
   * Retrieves current ApplicationSettings.
   * Concurrency-safe singleton retrieval and initialization using upsert on isSingleton constraint.
   */
  static async getApplicationSettings() {
    return prisma.applicationSettings.upsert({
      where: { isSingleton: true },
      update: {},
      create: {
        isSingleton: true,
        timezone: config.APP_TIMEZONE || 'Asia/Kolkata',
        defaultLanguage: 'en',
        timeFormat: '12h',
        dateFormat: 'YYYY-MM-DD',
        firstDayOfWeek: 0,
        defaultView: 'month',
      },
    });
  }

  /**
   * Updates ApplicationSettings.
   * Enforces OWNER/ADMIN permission, validates timezone, logs changes only on real modifications.
   * INVARIANT: Changing timezone does not mutate stored UTC schedule dates.
   */
  static async updateApplicationSettings(input: UpdateApplicationSettingsInput, user: AuthUser) {
    if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
      throw new Error('FORBIDDEN: Only Owners and Admins have permission to modify application settings.');
    }

    const currentSettings = await this.getApplicationSettings();

    // Determine which fields actually changed
    const changedFields: string[] = [];
    const fieldsToCheck: (keyof UpdateApplicationSettingsInput)[] = [
      'timezone',
      'defaultLanguage',
      'timeFormat',
      'dateFormat',
      'firstDayOfWeek',
      'defaultView',
    ];

    for (const field of fieldsToCheck) {
      if (input[field] !== undefined) {
        const newVal = input[field];
        const oldVal = (currentSettings as Record<string, unknown>)[field];
        if (newVal !== oldVal) {
          changedFields.push(field);
        }
      }
    }

    const updated = await prisma.applicationSettings.update({
      where: { id: currentSettings.id },
      data: {
        timezone: input.timezone,
        defaultLanguage: input.defaultLanguage,
        timeFormat: input.timeFormat,
        dateFormat: input.dateFormat,
        firstDayOfWeek: input.firstDayOfWeek,
        defaultView: input.defaultView,
      },
    });

    // Only create an activity log if real changes occurred
    if (changedFields.length > 0) {
      await ActivityService.log({
        userId: user.id,
        action: 'APPLICATION_SETTINGS_UPDATED',
        entityType: 'APPLICATION_SETTINGS',
        entityId: updated.id,
        metadata: {
          updatedFields: changedFields,
          newTimezone: updated.timezone,
        },
      });
    }

    return updated;
  }
}

