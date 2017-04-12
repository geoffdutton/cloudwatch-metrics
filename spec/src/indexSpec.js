/* globals describe, it, expect, jest, beforeEach */
jest.useFakeTimers();

describe('cloudwatch-metrics', function() {
  var cwPut;
  var cloudwatchMetric;
  var AWS;

  beforeEach(function() {
    AWS = require('aws-sdk');
    AWS.CloudWatch = jest.fn();
    cwPut = AWS.CloudWatch.prototype.putMetricData = jest.fn(function(params, callback) {
      callback(null, 'response');
    });
    cloudwatchMetric = require('../../');
  });

  describe('initialize', function() {
    it('should set the AWS config', function() {
      var cfg = {
        region: 'us-west-1'
      };
      cloudwatchMetric.initialize(cfg);
      new cloudwatchMetric.Metric();
      expect(AWS.CloudWatch).toHaveBeenCalledTimes(1);
      expect(AWS.CloudWatch).toHaveBeenCalledWith(cfg);
    });
  });

  describe('put', function() {
    it('should toggled enabled', function () {
      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], { enabled: false });

      metric.put(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);
      expect(cwPut).not.toHaveBeenCalled();
      jest.runOnlyPendingTimers();
      expect(cwPut).not.toHaveBeenCalled();
    });

    it('should add to existing entries', function() {
      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }]);

      metric.put(1, 'metricName');
      expect(metric._storedMetrics).toEqual([{
        MetricName: 'metricName',
        Dimensions: [{
          Name: 'environment',
          Value: 'PROD'
        }],
        Unit: 'Count',
        Value: 1
      }]);
    });

    it('should buffer until timeout', function() {
      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 1000,
        sendCallback: jest.fn()
      });

      metric.put(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);
      metric.put(2, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);
      expect(cwPut).not.toHaveBeenCalled();
      jest.runOnlyPendingTimers();
      expect(cwPut).toHaveBeenCalledWith({
        MetricData: [{
          Dimensions: [{
            Name: "environment",
            Value: "PROD"
          }, {
            Name: "ExtraDimension",
            Value: "Value"
          }],
          MetricName: "metricName",
          Unit: "Count",
          Value: 1
        }, {
          Dimensions: [{
            Name: "environment",
            Value: "PROD"
          }, {
            Name: "ExtraDimension",
            Value: "Value"
          }],
          MetricName: "metricName",
          Unit: "Count",
          Value: 2
        }],
        Namespace: 'namespace'
      }, metric.options.sendCallback);
      expect(metric.options.sendCallback).toHaveBeenCalledWith(null, 'response');
    });

    it('should buffer until the cap is hit', function() {
      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 3000,
        maxCapacity: 2
      });

      metric.options.sendCallback = jest.fn();

      metric.put(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);
      metric.put(2, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);

      expect(cwPut).toHaveBeenCalledWith({
        MetricData: [{
          Dimensions: [{
            Name: "environment",
            Value: "PROD"
          }, {
            Name: "ExtraDimension",
            Value: "Value"
          }],
          MetricName: "metricName",
          Unit: "Count",
          Value: 1
        }, {
          Dimensions: [{
            Name: "environment",
            Value: "PROD"
          }, {
            Name: "ExtraDimension",
            Value: "Value"
          }],
          MetricName: "metricName",
          Unit: "Count",
          Value: 2
        }],
        Namespace: 'namespace'
      }, metric.options.sendCallback);
      expect(metric.options.sendCallback).toHaveBeenCalledWith(null, 'response');
    });

    it('should not call cloudwatch if empty', function() {
      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 1000
      });

      metric._sendMetrics();
      expect(cwPut).not.toHaveBeenCalled();
      jest.runOnlyPendingTimers();
      expect(cwPut).not.toHaveBeenCalled();
    });

    it('should call continually', function() {
      var expectedPutMetricsCall = {
        MetricData: [],
        Namespace: 'namespace'
      };

      var sendCallback = jest.fn();

      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }], {
        sendInterval: 500,
        sendCallback
      });

      var count = 4;
      while(count--) {
        metric.put(count, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);
        expectedPutMetricsCall.MetricData.push({
          Dimensions: [{
            Name: "environment",
            Value: "PROD"
          }, {
            Name: "ExtraDimension",
            Value: "Value"
          }],
            MetricName: "metricName",
          Unit: "Count",
          Value: count
        });
        jest.runTimersToTime(400);
      }

      expect(cwPut).toHaveBeenCalledTimes(3);
      expect(cwPut).toHaveBeenCalledWith({
        MetricData: [{
          Dimensions: [{
            Name: "environment",
            Value: "PROD"
          }, {
            Name: "ExtraDimension",
            Value: "Value"
          }],
          MetricName: "metricName",
          Unit: "Count",
          Value: 1
        }],
        Namespace: 'namespace'
      }, metric.options.sendCallback);
    });
  });

  describe('flush', function() {
    it('should immediately call putMetricData', function() {
      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }]);

      metric.put(1, 'metricName');
      metric.flush();
      expect(metric._interval).toBe(null);
      expect(cwPut).toHaveBeenCalledWith({
        MetricData: [{
          MetricName: 'metricName',
          Dimensions: [{
            Name: 'environment',
            Value: 'PROD'
          }],
          Unit: 'Count',
          Value: 1
        }],
        Namespace: 'namespace'
      }, metric.options.sendCallback);
    });
  });

  describe('sample', function() {
    it('should ignore metrics when not in the sample range', function() {
      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }]);
      Math.random = jest.fn().mockReturnValue(0.5);
      metric.put = jest.fn();

      metric.sample(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}], 0.2);
      expect(metric.put).not.toHaveBeenCalled();
    });

    it('should call put when the we decide to sample a metric', function() {
      var metric = new cloudwatchMetric.Metric('namespace', 'Count', [{
        Name: 'environment',
        Value: 'PROD'
      }]);
      Math.random = jest.fn().mockReturnValue(0.1);
      metric.put = jest.fn();

      metric.sample(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}], 0.2);
      expect(metric.put).toHaveBeenCalledTimes(1);
      expect(metric.put).toHaveBeenCalledWith(1, 'metricName', [{Name:'ExtraDimension',Value: 'Value'}]);
    });
  });
});
