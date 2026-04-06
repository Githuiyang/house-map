import { describe, expect, it } from 'vitest';
import { buildRentalVector, createRentalRecord, parseRentalInput, validateRentalParsed } from './rentalProcessing';

describe('parseRentalInput', () => {
  it('extracts core fields from concise openclaw text', () => {
    const parsed = parseRentalInput({
      rawText: '国定路财大小区，二室一厅，双南，精装修，6500元约看房，4月20号空',
      source: 'openclaw',
    });

    expect(parsed.communityName).toBe('国定路财大小区');
    expect(parsed.price).toBe(6500);
    expect(parsed.layout).toBe('二室一厅');
    expect(parsed.rooms).toBe(2);
    expect(parsed.halls).toBe(1);
    expect(parsed.orientation).toContain('双南');
    expect(parsed.decoration).toBe('精装修');
    expect(parsed.availableFrom).toBe('04-20');
  });

  it('recognizes negotiable, elevator and parking hints', () => {
    const parsed = parseRentalInput({
      rawText: '三门路 婚房装修 电梯二房二厅 挂牌7800可谈有钥匙 含地下车位',
      source: 'openclaw',
    });

    expect(parsed.communityName).toBe('三门路');
    expect(parsed.price).toBe(7800);
    expect(parsed.layout).toBe('二室二厅');
    expect(parsed.negotiable).toBe(true);
    expect(parsed.hasKey).toBe(true);
    expect(parsed.parkingIncluded).toBe(true);
    expect(parsed.elevator).toBe(true);
  });
});

describe('validateRentalParsed', () => {
  it('flags missing critical fields', () => {
    const parsed = parseRentalInput({
      rawText: '只说双南精装修，没有小区和价格',
      source: 'openclaw',
    });

    const result = validateRentalParsed(parsed);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('缺少租金信息');
  });
});

describe('createRentalRecord', () => {
  it('builds vector payload for later retrieval', () => {
    const record = createRentalRecord({
      rawText: '美岸栖庭二房出租7300一个月。',
      source: 'openclaw',
    });

    const vector = buildRentalVector(record.parsed, record.rawText);
    expect(record.dedupeKey).toHaveLength(40);
    expect(vector.dense[0]).toBe(7300);
    expect(vector.keywords).toContain('美岸栖庭');
    expect(record.validation.isValid).toBe(true);
  });

  it('keeps batch parsing throughput in a reasonable range', () => {
    const samples = [
      '国定路财大小区，二室一厅，双南，精装修，6500元约看房，4月20号空',
      '国年路25弄，双南两房，5300可谈。',
      '三门路 婚房装修 电梯二房二厅 挂牌7800可谈有钥匙 含地下车位',
      '美岸栖庭二房出租7300一个月。',
    ];

    const start = performance.now();
    for (let i = 0; i < 2500; i++) {
      createRentalRecord({
        rawText: samples[i % samples.length],
        source: 'openclaw',
      });
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1500);
  });
});
