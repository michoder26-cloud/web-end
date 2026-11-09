import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import plan

VALID = {'site_name':'Studio', 'summary':'A booking site', 'pages':[{'name':'Home','purpose':'Introduction'}], 'features':['Requests']}

class PlanTests(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(plan.parse_plan(json.dumps(VALID)), VALID)

    def test_invalid_and_malicious(self):
        cases = ['not json', '{"site_name":"a","site_name":"b"}', json.dumps({**VALID,'extra':1}),
                 json.dumps({**VALID,'pages':[]}), json.dumps({**VALID,'features':['<script>alert(1)</script>']}),
                 json.dumps({**VALID,'summary':'x'*501}), json.dumps({**VALID,'pages':[{'name':'x','purpose':42}]}),
                 json.dumps({**VALID,'features':['line\nbreak']})]
        for case in cases:
            with self.subTest(case=case[:60]), self.assertRaises(plan.InvalidPlan):
                plan.parse_plan(case)

    def test_request_flags_and_reject_tool_events(self):
        executable = os.path.abspath(__file__)
        def fake(args, **kwargs):
            self.assertFalse(kwargs['shell'])
            self.assertIn('never', args); self.assertIn('read-only', args)
            self.assertIn('shell_tool', args); self.assertIn('apps', args)
            self.assertNotIn('injected', args)
            self.assertIn('injected', kwargs['input'])
            output = Path(args[args.index('--output-last-message')+1])
            output.write_text(json.dumps(VALID), encoding='utf-8')
            return subprocess.CompletedProcess(args, 0, json.dumps({'item':{'type':'command_execution'}}), '')
        with patch('plan.subprocess.run', side_effect=fake):
            with self.assertRaises(RuntimeError):
                plan.create_plan('injected', executable)

    def test_failure_never_returns_model_output(self):
        def fake(args, **kwargs):
            return subprocess.CompletedProcess(args, 1, 'secret', 'secret')
        with patch('plan.subprocess.run', side_effect=fake), self.assertRaisesRegex(RuntimeError, '^Codex request failed$'):
            plan.create_plan('brief', os.path.abspath(__file__))

if __name__ == '__main__':
    unittest.main()
